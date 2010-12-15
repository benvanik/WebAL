(function () {
    var exports = window;

    var MAXCHANNELS = 3; // L R C
    var FRONT_LEFT = 0;
    var FRONT_RIGHT = 1;
    var FRONT_CENTER = 2;
    var STACK_DATA_SIZE = 16384;
    var FRACTIONBITS = 14;
    var FRACTIONONE = (1 << FRACTIONBITS);
    var FRACTIONMASK = (FRACTIONONE - 1);
    var POINT_RESAMPLER = 0;
    var LINEAR_RESAMPLER = 1;
    var CUBIC_RESAMPLER = 2;
    var RESAMPLERPADDING = [0 /*point*/, 1 /*linear*/, 2 /*cubic*/];
    var RESAMPLERPREPADDING = [0 /*point*/, 0 /*linear*/, 1 /*cubic*/];

    var WebALSource = function (context) {
        WebALObject.apply(this, [context]);

        WebALSource.initPanningLUT(context.device.channels);

        this.pitch = 1.0;
        this.gain = 1.0;
        this.minGain = 0.0;
        this.maxGain = 1.0;
        this.maxDistance = Number.MAX_VALUE;
        this.rolloffFactor = 1.0;
        this.outerGain = 0.0;
        this.outerGainHF = 1.0;
        this.innerAngle = 360.0;
        this.outerAngle = 360.0;
        this.minDistance = 1.0;
        this.position = [0, 0, 0];
        this.direction = [0, 0, 0];
        this.velocity = [0, 0, 0];
        this.sourceRelative = false;
        this.type = context.UNDETERMINED;
        this.looping = false;
        this.buffer = null;
        this.state = context.INITIAL;
        this.resampler = LINEAR_RESAMPLER;

        this.queue = [];
        this.buffersQueued = 0;
        this.buffersProcessed = 0;

        this.dataPosition = 0;
        this.dataPositionFrac = 0;

        // ?
        this.offset = 0;
        this.offsetType = 0;

        this.params = {
            step: 0,
            dryGains: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
            iirFilter: {
                coeff: 0,
                history: [0, 0, 0, 0, 0, 0, 0, 0, 0]
            }
        };

        this.needsUpdate = false;
        this.context.device.sourceUpdateRequested(this);
    };
    WebALSource.prototype = new WebALObject();
    WebALSource.prototype.constructor = WebALSource;

    WebALSource.prototype._drainQueue = function () {
        for (var n = 0; n < this.queue.length; n++) {
            var buffer = this.queue[n];
            buffer.referencingSources.splice(buffer.referencingSources.indexOf(this), 1);
            this.context.device.unbindSourceBuffer(this, buffer);
        }
        this.queue.length = 0;
    };

    WebALSource.prototype._getSourceOffset = function (pname, updateLength) {
        // Gets the current playback position in the appropriate format (bytes, samples, or ms) relative to the start of the queue (NOT the current buffer)
        var offsets = [0, 0];
        // TODO: alSource.c line 1800
        return offsets;
    };

    WebALSource.prototype._getByteOffset = function () {
        // TODO: alSource.c line 1976
        return 0;
    };

    WebALSource.prototype._applyOffset = function () {
        // Apply a playback offset - update the queue (mark buffers as pending/processed) depending on the new offset
        // TODO: alSource.c line 1917
        return true;
    };

    // Will return false if another update is required
    WebALSource.prototype._update = function () {
        if (!this.needsUpdate) {
            return true;
        }
        this.needsUpdate = false;

        // Guess how many channels we have based on the first buffer
        if (this.queue.length > 0) {
            var buffer = this.queue[0];
            switch (buffer.channels) {
                case 1:
                    this._updateMono();
                    break;
                case 2:
                    this._updateStereo();
                    break;
            }
            return true;
        } else {
            // No buffers - try later
            this.needsUpdate = true;
            return false;
        }
    };

    var INT_MAX = 2147483647;
    var AIRABSORBGAINDBHF = -0.05;
    var LOWPASSFREQCUTOFF = 5000;

    function aluCrossproduct(v1, v2, ov) {
        ov[0] = v1[1] * v2[2] - v1[2] * v2[1];
        ov[1] = v1[2] * v2[0] - v1[0] * v2[2];
        ov[2] = v1[0] * v2[1] - v1[1] * v2[0];
    };

    function aluDotproduct(v1, v2) {
        return v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
    };

    function aluNormalize(v) {
        var length = Math.sqrt(aluDotproduct(v, v));
        if (length != 0.0) {
            var inverseLength = 1.0 / length;
            v[0] *= inverseLength;
            v[1] *= inverseLength;
            v[2] *= inverseLength;
        }
    };

    var M00 = 0; var M01 = 1; var M02 = 2; var M03 = 3;
    var M10 = 4; var M11 = 5; var M12 = 6; var M13 = 7;
    var M20 = 8; var M21 = 9; var M22 = 10; var M23 = 11;
    var M30 = 12; var M31 = 13; var M32 = 14; var M33 = 15;

    function aluMatrixVector(v, w, m) {
        var x = v[0]; var y = v[1]; var z = v[2];
        v[0] = x * m[M00] + y * m[M10] + z * m[M20] + w * m[M30];
        v[1] = x * m[M01] + y * m[M11] + z * m[M21] + w * m[M31];
        v[2] = x * m[M02] + y * m[M12] + z * m[M22] + w * m[M32];
    };

    var QUADRANT_NUM = 128;
    var LUT_NUM = 4 * QUADRANT_NUM;
    function aluLUTpos2Angle(pos) {
        if (pos < QUADRANT_NUM) {
            return Math.atan(pos / (QUADRANT_NUM - pos));
        }
        if (pos < 2 * QUADRANT_NUM) {
            return Math.PI / 2 + Math.atan((pos - QUADRANT_NUM) / (2 * QUADRANT_NUM - pos));
        }
        if (pos < 3 * QUADRANT_NUM) {
            return Math.atan((pos - 2 * QUADRANT_NUM) / (3 * QUADRANT_NUM - pos)) - Math.PI;
        }
        return Math.atan((pos - 3 * QUADRANT_NUM) / (4 * QUADRANT_NUM - pos)) - Math.PI / 2;
    };
    function aluCart2LUTpos(re, im) {
        var pos = 0;
        var denom = Math.abs(re) + Math.abs(im);
        if (denom > 0.0) {
            pos = Math.floor(QUADRANT_NUM * Math.abs(im) / denom + 0.5);
        }
        if (re < 0.0) {
            pos = 2 * QUADRANT_NUM - pos;
        }
        if (im < 0.0) {
            pos = LUT_NUM - pos;
        }
        return pos % LUT_NUM;
    };

    var panningLUT = null;
    WebALSource.initPanningLUT = function (deviceChannels) {
        if (panningLUT) {
            return;
        }
        panningLUT = new WebALFloatArray(MAXCHANNELS * LUT_NUM);
        if (deviceChannels == 1) {
            for (var pos = 0; pos < LUT_NUM; pos++) {
                var offset = MAXCHANNELS * pos;
                for (var n = 0; n < MAXCHANNELS; n++) {
                    panningLUT[offset + n] = 0.0;
                }
                panningLUT[offset + FRONT_CENTER] = 1.0;
            }
        } else if (deviceChannels == 2) {
            var speakerAngle = [-90.0 * Math.PI / 180.0, 90.0 * Math.PI / 180.0];
            for (var pos = 0; pos < LUT_NUM; pos++) {
                var offset = MAXCHANNELS * pos;
                for (var n = 0; n < MAXCHANNELS; n++) {
                    panningLUT[offset + n] = 0.0;
                }
                var theta = aluLUTpos2Angle(pos);
                // FRONT_LEFT
                if ((theta >= speakerAngle[0]) && (theta < speakerAngle[1])) {
                    var alpha = Math.PI / 2 * (theta - speakerAngle[0]) / (speakerAngle[1] - speakerAngle[0]);
                    panningLUT[offset + FRONT_LEFT] = Math.cos(alpha);
                    panningLUT[offset + FRONT_RIGHT] = Math.sin(alpha);
                }
                // FRONT_RIGHT
                if (theta < speakerAngle[0]) {
                    theta += 2.0 * Math.PI;
                }
                var alpha = Math.PI / 2 * (theta - speakerAngle[1]) / (2.0 * Math.PI + speakerAngle[0] - speakerAngle[1]);
                panningLUT[offset + FRONT_RIGHT] = Math.cos(alpha);
                panningLUT[offset + FRONT_LEFT] = Math.sin(alpha);
            }
        }
    };

    // Calculates the low-pass filter coefficient given the pre-scaled gain and
    // cos(w) value. Note that g should be pre-scaled (sqr(gain) for one-pole,
    // sqrt(gain) for four-pole, etc)
    function lpCoeffCalc(g, cw) {
        var a = 0.0;
        /* Be careful with gains < 0.01, as that causes the coefficient
        * head towards 1, which will flatten the signal */
        g = Math.max(g, 0.01);
        if (g < 0.9999) { /* 1-epsilon */
            a = (1 - g * cw - Math.sqrt(2 * g * (1 - cw) - g * g * (1 - cw * cw))) / (1 - g);
        }
        return a;
    };

    WebALSource.prototype._updateMono = function () {
        var al = this.context;

        // Device properties
        var deviceChannels = al.device.channels;
        var frequency = al.device.frequency;

        // Context properties
        var dopplerFactor = al.state.dopplerFactor * al.state.dopplerFactor;
        var dopplerVelocity = 1.0;
        var speedOfSound = al.state.speedOfSound;

        // Listener properties
        var listenerGain = al.listener.gain;
        var metersPerUnit = 1.0;
        var listenerVelocity = al.listener.velocity.slice();

        // Source properties
        var position = this.position.slice();
        var direction = this.direction.slice();
        var velocity = this.velocity.slice();

        var airAbsorptionFactor = 0.0;
        var headDampen = 0.0;

        var dryGain = 0.0;
        var dryGainHF = 1.0;

        // 1. Translate listener to origin (convert to source relative)
        if (this.sourceRelative) {
            listenerVelocity[0] = listenerVelocity[1] = listenerVelocity[2] = 0.0;
        } else {
            // Build transform matrix
            var N = al.listener.forward.slice(); // At
            var V = al.listener.up.slice(); // Up
            aluNormalize(N); // Normalized at
            aluNormalize(V); // Normalized up
            var U = [0, 0, 0];
            aluCrossproduct(N, V, U); // Right
            aluNormalize(U); // Normalized right
            var m = new Array(16);
            m[M00] = U[0]; m[M01] = V[0]; m[M02] = -N[0]; m[M03] = 0.0;
            m[M10] = U[1]; m[M11] = V[1]; m[M12] = -N[1]; m[M13] = 0.0;
            m[M20] = U[2]; m[M21] = V[2]; m[M22] = -N[2]; m[M23] = 0.0;
            m[M30] = 0.0; m[M31] = 0.0; m[M32] = 0.0; m[M33] = 1.0;

            // Translate position
            position[0] -= al.listener.position[0];
            position[1] -= al.listener.position[1];
            position[2] -= al.listener.position[2];

            // Transform source position and direction into listener space
            aluMatrixVector(position, 1.0, m);
            aluMatrixVector(direction, 0.0, m);
            // Transform source and listener velocity into listener space
            aluMatrixVector(velocity, 0.0, m);
            aluMatrixVector(listenerVelocity, 0.0, m);
        }

        var sourceToListener = [-position[0], -position[1], -position[2]];
        aluNormalize(sourceToListener);
        aluNormalize(direction);

        // 2. Calculate distance attenuation
        var distance = Math.sqrt(aluDotproduct(position, position));
        var originalDistance = distance;

        var attenuation = 1.0;
        switch (al.state.distanceModel) {
            case al.INVERSE_DISTANCE_CLAMPED:
                distance = Math.max(distance, this.minDistance);
                distance = Math.min(distance, this.maxDistance);
                if (this.maxDistance < this.minDistance) {
                    break;
                }
                // fall-through to INVERSE_DISTANCE
            case al.INVERSE_DISTANCE:
                if (this.minDistance > 0.0) {
                    if ((this.minDistance + (this.rolloffFactor * (distance - this.minDistance))) > 0.0) {
                        attenuation = this.minDistance / (this.minDistance + (this.rolloffFactor * (distance - this.minDistance)));
                    }
                }
                break;
            case al.LINEAR_DISTANCE_CLAMPED:
                distance = Math.max(distance, this.minDistance);
                distance = Math.min(distance, this.maxDistance);
                if (this.maxDistance < this.minDistance) {
                    break;
                }
                // fall-through to LINEAR_DISTANCE
            case al.LINEAR_DISTANCE:
                if (this.maxDistance != this.minDistance) {
                    attenuation = 1.0 - (this.rolloffFactor * (distance - this.minDistance) / (this.maxDistance - this.minDistance));
                    attenuation = Math.max(attenuation, 0.0);
                }
                break;
            case al.EXPONENT_DISTANCE_CLAMPED:
                distance = Math.max(distance, this.minDistance);
                distance = Math.min(distance, this.maxDistance);
                if (this.maxDistance < this.minDistance) {
                    break;
                }
                // fall-through to EXPONENT_DISTANCE
            case al.EXPONENT_DISTANCE:
                if ((distance > 0.0) && (this.minDistance > 0.0)) {
                    attenuation = Math.pow(distance / this.minDistance, -this.rolloffFactor);
                }
                break;
            case al.NONE:
                break;
        }

        // Source gain + attenuation
        dryGain = this.gain * attenuation;

        // Distance-based air absorption
        var effectiveDistance = 0.0;
        if ((this.minDistance > 0.0) && (this.attenuation < 1.0)) {
            effectiveDistance = (this.minDistance / attenuation - this.minDistance) * metersPerUnit;
        }
        if ((airAbsorptionFactor > 0.0) && (effectiveDistance > 0.0)) {
            // Absorption calculation is done in dB
            var absorb = (airAbsorptionFactor * AIRABSORBGAINDBHF) * effectiveDistance;
            // Convert dB to linear gain before applying
            absorb = Math.pow(10.0, absorb / 20.0);
            dryGainHF *= absorb;
        }

        // 3. Apply directional soundcones
        var coneVolume;
        var coneHF;
        var angle = Math.acos(aluDotproduct(direction, sourceToListener)) * 180.0 / Math.PI;
        if ((angle >= this.innerAngle) && (angle <= this.outerAngle)) {
            var scale = (angle - this.innerAngle) / (this.outerAngle - this.innerAngle);
            coneVolume = (1.0 + (this.outerGain - 1.0) * scale);
            coneHF = (1.0 + (this.outerGainHF - 1.0) * scale);
        } else if (angle > this.outerAngle) {
            coneVolume = (1.0 + (this.outerGain - 1.0));
            coneHF = (1.0 + (this.outerGainHF - 1.0));
        } else {
            coneVolume = 1.0;
            coneHF = 1.0;
        }

        // Apply some high-frequency attenuation for sources behind the listener
        // NOTE: This should be aluDotproduct({0,0,-1}, ListenerToSource), however
        // that is equivalent to aluDotproduct({0,0,1}, SourceToListener), which is
        // the same as SourceToListener[2]
        var angle = Math.acos(sourceToListener[2]) * 180.0 / Math.PI;
        // Sources within the minimum distance attenuate less
        if (originalDistance < this.minDistance) {
            angle *= originalDistance / this.minDistance;
        }
        if (angle > 90.0) {
            var scale = (angle - 90.0) / (180.1 - 90.0); // .1 to account for fp errors
            coneHF *= 1.0 - (headDampen * scale);
        }

        dryGain *= coneVolume;
        dryGainHF *= coneHF;

        // Clamp gain and mod by listener
        dryGain = Math.min(dryGain, this.maxGain);
        dryGain = Math.max(dryGain, this.minGain);
        dryGain *= listenerGain;

        // Calculate velocity
        var pitch = this.pitch;
        if (dopplerFactor != 0.0) {
            var maxVelocity = (speedOfSound * dopplerVelocity) / dopplerFactor;

            var vss = aluDotproduct(velocity, sourceToListener);
            if (vss >= maxVelocity) {
                vss = maxVelocity - 1.0;
            } else if (vss <= -maxVelocity) {
                vss = -maxVelocity + 1.0;
            }

            var vls = aluDotproduct(listenerVelocity, sourceToListener);
            if (vls >= maxVelocity) {
                vls = maxVelocity - 1.0;
            } else if (vls <= -maxVelocity) {
                vls = -maxVelocity + 1.0;
            }

            pitch *= ((speedOfSound * dopplerVelocity) - (dopplerFactor * vls)) / ((speedOfSound * dopplerVelocity) - (dopplerFactor * vss));
        }

        // Calculate the stepping value
        if (this.queue.length > 0) {
            var buffer = this.queue[0];

            var maxstep = STACK_DATA_SIZE / (buffer.channels * buffer.type);
            maxstep -= RESAMPLERPADDING[this.resampler] + RESAMPLERPREPADDING[this.resampler] + 1;
            maxstep = Math.min(maxstep, INT_MAX >> FRACTIONBITS);

            pitch = pitch * buffer.frequency / frequency;
            if (pitch > maxstep) {
                this.params.step = maxstep << FRACTIONBITS;
            } else {
                this.params.step = pitch * FRACTIONONE;
                if (this.params.step == 0) {
                    this.params.step = 1;
                }
            }
        }

        // Use energy-preserving panning algorithm for multi-speaker playback
        var length = Math.max(originalDistance, this.minDistance);
        if (length > 0.0) {
            position[0] /= length;
            position[1] /= length;
            position[2] /= length;
        }

        // Elevation adjustment for directional gain
        var directionalGain = Math.sqrt(position[0] * position[0] + position[2] * position[2]);
        var ambientGain = Math.sqrt(1.0 / deviceChannels);
        for (var n = 0; n < MAXCHANNELS; n++) {
            for (var m = 0; m < MAXCHANNELS; m++) {
                this.params.dryGains[n][m] = 0.0;
            }
        }
        var pos = aluCart2LUTpos(-position[2], position[0]);
        if (deviceChannels == 1) {
            var centerGain = panningLUT[MAXCHANNELS * pos + FRONT_CENTER];
            var combinedGain = ambientGain + (centerGain - ambientGain) * directionalGain;
            this.params.dryGains[0][FRONT_CENTER] = dryGain * combinedGain;
        } else {
            var leftGain = panningLUT[MAXCHANNELS * pos + FRONT_LEFT];
            var rightGain = panningLUT[MAXCHANNELS * pos + FRONT_RIGHT];
            var leftCombinedGain = ambientGain + (leftGain - ambientGain) * directionalGain;
            this.params.dryGains[0][FRONT_LEFT] = dryGain * leftCombinedGain;
            var rightCombinedGain = ambientGain + (rightGain - ambientGain) * directionalGain;
            this.params.dryGains[0][FRONT_RIGHT] = dryGain * rightCombinedGain;
        }

        // Update filter coefficients. Calculations based on the I3DL2 spec.
        var cw = Math.cos(2.0 * Math.PI * LOWPASSFREQCUTOFF / frequency);

        // Spatialized sources use four chained one-pole filters, so we need to
        // take the fourth root of the squared gain, which is the same as the
        // square root of the base gain.
        this.params.iirFilter.coeff = lpCoeffCalc(Math.sqrt(dryGainHF), cw);
    };

    WebALSource.prototype._updateStereo = function () {
        var al = this.context;

        // Device properties
        var deviceChannels = al.device.channels;
        var frequency = al.device.frequency;

        // Listener properties
        var listenerGain = al.listener.gain;

        // Calculate the stepping value
        var channels = 1;
        var pitch = this.pitch;
        if (this.queue.length > 0) {
            var buffer = this.queue[0];

            var maxstep = STACK_DATA_SIZE / (buffer.channels * buffer.type);
            maxstep -= RESAMPLERPADDING[this.resampler] + RESAMPLERPREPADDING[this.resampler] + 1;
            maxstep = Math.min(maxstep, INT_MAX >> FRACTIONBITS);

            pitch = pitch * buffer.frequency / frequency;
            if (pitch > maxstep) {
                this.params.step = maxstep << FRACTIONBITS;
            } else {
                this.params.step = pitch * FRACTIONONE;
                if (this.params.step == 0) {
                    this.params.step = 1;
                }
            }

            channels = buffer.channels;
        }

        // Calculate gains
        var dryGain = this.gain;
        dryGain = Math.min(dryGain, this.maxGain);
        dryGain = Math.max(dryGain, this.minGain);
        var dryGainHF = 1.0;

        for (var n = 0; n < MAXCHANNELS; n++) {
            for (var m = 0; m < MAXCHANNELS; m++) {
                this.params.dryGains[n][m] = 0.0;
            }
        }

        switch (channels) {
            case 1:
                this.params.dryGains[0][FRONT_CENTER] = dryGain * listenerGain;
                break;
            case 2:
                switch (deviceChannels) {
                    case 1:
                    case 2:
                        this.params.dryGains[0][FRONT_LEFT] = dryGain * listenerGain;
                        this.params.dryGains[1][FRONT_RIGHT] = dryGain * listenerGain;
                        break;
                }
                break;
        }

        // Update filter coefficients. Calculations based on the I3DL2 spec.
        var cw = Math.cos(2.0 * Math.PI * LOWPASSFREQCUTOFF / frequency);

        // We use two chained one-pole filters, so we need to take the
        // square root of the squared gain, which is the same as the base gain.
        this.params.iirFilter.coeff = lpCoeffCalc(dryGainHF, cw);
    };

    exports.WebALSource = WebALSource;
})();
