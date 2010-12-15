(function () {
    var exports = window;

    // Hacky support for browsers that don't support Typed Arrays yet
    var WebALFloatArray;
    if (typeof Float32Array !== "undefined") {
        WebALFloatArray = Float32Array;
    } else {
        WebALFloatArray = function (size) {
            var result = [];
            if (typeof size === "number") {
                if (size) {
                    // First expand to the right size then zero fill
                    result[size - 1] = 0.0;
                    for (var n = 0; n < size; n++) {
                        result[n] = 0.0;
                    }
                }
            } else {
                var source = size;
                if (source.length) {
                    result[source.length - 1] = 0.0;
                    for (var n = 0; n < source.length; n++) {
                        result[n] = source[n];
                    }
                }
            }
            result.byteLength = result.length * 4;
            return result;
        };
    }



    var WebAL = {
        sharedContext: null
    };

    WebAL.getContext = function (attributes) {
        if (WebAL.sharedContext) {
            return WebAL.sharedContext;
        } else {
            var attributes = {};

            // Check the URL for an override on the device
            var query = window.location.search;
            if (query.length > 0) {
                query = query.substr(1);
                var terms = query.split("&");
                for (var n = 0; n < terms.length; n++) {
                    var parts = terms[n].split("=");
                    if (parts[0] === "webal_device") {
                        attributes.device = parts[1];
                    }
                }
            }

            var attr = new WebALContextAttributes(attributes);
            var context = new WebALContext(attr);

            WebAL.sharedContext = context;

            return context;
        }
    };



    var WebALObject = function (context) {
        this.context = context;

        this.isAlive = true;
    };

    exports.WebALObject = WebALObject;



    exports.WebAL = WebAL;

    // HACK: only because I'm lazy
    exports.WebALFloatArray = WebALFloatArray;

})();
(function () {
    var exports = window;

    var WebALContextAttributes = function (source) {
        this.frequency = (source && source.frequency) ? source.frequency : 44100;
        this.refreshInterval = (source && source.refreshInterval) ? source.refreshInterval : 16;
        this.channels = (source && source.channels) ? source.channels : 2;
        this.device = (source && source.device) ? source.device : null;
        this.supportDynamicAudio = (source && source.supportDynamicAudio !== undefined) ? source.supportDynamicAudio : true;
        this.supportStreaming = (source && source.supportStreaming !== undefined) ? source.supportStreaming : true;
        this.support3D = (source && source.support3D !== undefined) ? source.support3D : true;

        // Validate
        this.frequency = Math.max(this.frequency, 1);
        this.frequency = Math.min(this.frequency, 1000000);
        this.refreshInterval = Math.max(this.refreshInterval, 1);
        this.refreshInterval = Math.min(this.refreshInterval, 1000);
        this.channels = Math.max(this.channels, 1);
        this.channels = Math.min(this.channels, 2);
    };

    var WebALContext = function (attributes) {
        this.attributes = attributes;

        this.buffers = [];
        this.sources = [];
        this.listener = new WebALListener();

        this.activeSources = [];

        this.state = {
            dopplerFactor: 1.0,
            speedOfSound: 343.3,
            distanceModel: this.INVERSE_DISTANCE_CLAMPED
        };

        this._errorCode = this.NO_ERROR;

        this._extensionList = [];

        // Pick a device based on detected support - unless overridden
        var devices = null;
        switch (this.attributes.device) {
            case "native":
                devices = [WebALNativeDevice, WebALNullDevice];
                break;
            case "flash":
                devices = [WebALFlashDevice, WebALNullDevice];
                break;
            case "browser":
                devices = [WebALBrowserDevice, WebALNullDevice];
                break;
            case "test":
                devices = [WebALTestDevice];
                break;
            case "null":
                devices = [WebALNullDevice];
                break;
        }
        if (!devices) {
            if (this.attributes.supportDynamicAudio || this.attributes.supportStreaming || this.attributes.support3D) {
                // Requested full cap mode
                devices = [WebALNativeDevice, WebALFlashDevice, WebALBrowserDevice, WebALNullDevice];
            } else {
                // Requested limited cap mode - try to use browser mixer over others
                devices = [WebALBrowserDevice, WebALNativeDevice, WebALFlashDevice, WebALNullDevice];
            }
        }
        for (var n = 0; n < devices.length; n++) {
            if (devices[n].detect() == true) {
                // Device is supported! Create
                this.device = devices[n].create(this);
                break;
            }
        }

        // Reset attributes to the real values used by the device
        this.attributes.frequency = this.device.frequency;
        this.attributes.channels = this.device.channels;
    };

    var constants = {
        INVALID: -1,
        NONE: 0,
        FALSE: 0,
        TRUE: 1,

        UBYTE: 1,
        SHORT: 2,
        FLOAT: 4,

        SOURCE_RELATIVE: 0x202,
        CONE_INNER_ANGLE: 0x1001,
        CONE_OUTER_ANGLE: 0x1002,
        PITCH: 0x1003,

        POSITION: 0x1004,
        DIRECTION: 0x1005,
        VELOCITY: 0x1006,

        LOOPING: 0x1007,
        BUFFER: 0x1009,

        GAIN: 0x100A,
        MIN_GAIN: 0x100D,
        MAX_GAIN: 0x100E,
        ORIENTATION: 0x100F,

        SOURCE_STATE: 0x1010,
        INITIAL: 0x1011,
        PLAYING: 0x1012,
        PAUSED: 0x1013,
        STOPPED: 0x1014,

        BUFFERS_QUEUED: 0x1015,
        BUFFERS_PROCESSED: 0x1016,

        SEC_OFFSET: 0x1024,
        SAMPLE_OFFSET: 0x1025,
        BYTE_OFFSET: 0x1026,

        SOURCE_TYPE: 0x1027,
        STATIC: 0x1028,
        STREAMING: 0x1029,
        UNDETERMINED: 0x1030,

        FORMAT_MONO8: 0x1100,
        FORMAT_MONO16: 0x1101,
        FORMAT_MONO_FLOAT32: 0x10010,
        FORMAT_STEREO8: 0x1102,
        FORMAT_STEREO16: 0x1103,
        FORMAT_STEREO_FLOAT32: 0x10011,

        REFERENCE_DISTANCE: 0x1020,
        ROLLOFF_FACTOR: 0x1021,
        CONE_OUTER_GAIN: 0x1022,
        MAX_DISTANCE: 0x1023,

        LOADED: 0x2000,
        FREQUENCY: 0x2001,
        BITS: 0x2002,
        CHANNELS: 0x2003,
        SIZE: 0x2004,

        UNUSED: 0x2010,
        QUEUED: 0x2011,
        CURRENT: 0x2012,

        NO_ERROR: 0,
        INVALID_NAME: 0xA001,
        INVALID_ENUM: 0xA002,
        INVALID_VALUE: 0xA003,
        INVALID_OPERATION: 0xA004,
        OUT_OF_MEMORY: 0xA005,

        VENDOR: 0xB001,
        VERSION: 0xB002,
        RENDERER: 0xB003,
        EXTENSIONS: 0xB004,

        DOPPLER_FACTOR: 0xC000,
        SPEED_OF_SOUND: 0xC003,

        DISTANCE_MODEL: 0xD000,
        INVERSE_DISTANCE: 0xD001,
        INVERSE_DISTANCE_CLAMPED: 0xD002,
        LINEAR_DISTANCE: 0xD003,
        LINEAR_DISTANCE_CLAMPED: 0xD004,
        EXPONENT_DISTANCE: 0xD005,
        EXPONENT_DISTANCE_CLAMPED: 0xD006
    };
    for (var n in constants) {
        WebALContext.prototype[n] = constants[n];
    }

    WebALContext.prototype.getContextAttributes = function () {
        // Clone so that modifications don't hurt us
        return new WebALContextAttributes(this.attributes);
    };

    WebALContext.prototype.getSupportedExtensions = function () {
        return [];
    };

    WebALContext.prototype.getExtension = function (name) {
        return null;
    };

    WebALContext.prototype.getError = function () {
        var error = this._errorCode;
        this._errorCode = this.NO_ERROR;
        return error;
    };
    WebALContext.prototype._setError = function (error) {
        this._errorCode = error;
    };

    WebALContext.prototype.enable = function (cap) {
        switch (cap) {
            default:
                this._setError(this.INVALID_ENUM);
                break;
        }
    };

    WebALContext.prototype.disable = function (cap) {
        switch (cap) {
            default:
                this._setError(this.INVALID_ENUM);
                break;
        }
    };

    WebALContext.prototype.isEnabled = function (cap) {
        switch (cap) {
            default:
                this._setError(this.INVALID_ENUM);
                return false;
        }
    };

    WebALContext.prototype.hint = function (target, mode) {
        this._setError(this.INVALID_ENUM);
    };

    WebALContext.prototype.getParameter = function (pname) {
        switch (pname) {
            case this.DOPPLER_FACTOR:
                return this.state.dopplerFactor;
            case this.SPEED_OF_SOUND:
                return this.state.speedOfSound;
            case this.DISTANCE_MODEL:
                return this.state.distanceModel;

            case this.VENDOR:
                return "Ben Vanik";
            case this.VERSION:
                return "WebAL 1.0";
            case this.RENDERER:
                return this.mixer.name;
            case this.EXTENSIONS:
                return this._extensionList;

            default:
                this._setError(this.INVALID_ENUM);
                return null;
        }
    };

    WebALContext.prototype.dopplerFactor = function (value) {
        if (value >= 0.0) {
            this.state.dopplerFactor = value;
        } else {
            this._setError(this.INVALID_VALUE);
        }
    };

    WebALContext.prototype.speedOfSound = function (value) {
        if (value > 0.0) {
            this.state.speedOfSound = value;
        } else {
            this._setError(this.INVALID_VALUE);
        }
    };

    WebALContext.prototype.distanceModel = function (value) {
        switch (value) {
            case this.NONE:
            case this.INVERSE_DISTANCE:
            case this.INVERSE_DISTANCE_CLAMPED:
            case this.LINEAR_DISTANCE:
            case this.LINEAR_DISTANCE_CLAMPED:
            case this.EXPONENT_DISTANCE:
            case this.EXPONENT_DISTANCE_CLAMPED:
                this.state.distanceModel = value;
                break;
            default:
                this._setError(this.INVALID_VALUE);
                break;
        }
    };

    // -- Listener --

    WebALContext.prototype.listenerParameter = function (pname, param) {
        var listener = this.listener;
        var updateAll = false;
        var updateWorld = false;
        switch (pname) {
            case this.GAIN:
                if (param >= 0) {
                    this.listener.gain = param;
                    updateAll = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;

            case this.POSITION:
                if (param && (param.length == 3)) {
                    listener.position[0] = param[0];
                    listener.position[1] = param[1];
                    listener.position[2] = param[2];
                    updateWorld = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;
            case this.VELOCITY:
                if (param && (param.length == 3)) {
                    listener.velocity[0] = param[0];
                    listener.velocity[1] = param[1];
                    listener.velocity[2] = param[2];
                    updateWorld = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;
            case this.ORIENTATION:
                if (param && (param.length == 6)) {
                    listener.forward[0] = param[0];
                    listener.forward[1] = param[1];
                    listener.forward[2] = param[2];
                    listener.up[0] = param[3];
                    listener.up[1] = param[4];
                    listener.up[2] = param[5];
                    updateWorld = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;

            default:
                this._setError(this.INVALID_ENUM);
                break;
        }

        if (updateAll || updateWorld) {
            for (var n = 0; n < this.sources.length; n++) {
                var source = this.sources[n];
                if (updateAll) {
                    this.device.sourceUpdateRequested(source);
                } else if (updateWorld) {
                    if (source.sourceRelative) {
                        this.device.sourceUpdateRequested(source);
                    }
                }
            }
        }
    };

    WebALContext.prototype.getListenerParameter = function (pname) {
        var listener = this.listener;
        switch (pname) {
            case this.GAIN:
                return listener.gain;

            case this.POSITION:
                return listener.position.slice();
            case this.VELOCITY:
                return listener.velocity.slice();
            case this.ORIENTATION:
                var forward = listener.forward;
                var up = listener.up;
                return [forward[0], forward[1], forward[2], up[0], up[1], up[2]];

            default:
                this._setError(this.INVALID_ENUM);
                return null;
        }
    };

    // -- Source --

    WebALContext.prototype.createSource = function () {
        var source = new WebALSource(this);

        this.sources.push(source);

        return source;
    };

    WebALContext.prototype.deleteSource = function (source) {
        if (!source || !source.isAlive) {
            this._setError(this.INVALID_NAME);
            return;
        }

        // Remove all buffers in queue
        source._drainQueue();

        source.isAlive = false;

        var index = this.sources.indexOf(source);
        if (index >= 0) {
            this.sources.splice(index, 1);
        }
        index = this.activeSources.indexOf(source);
        if (index >= 0) {
            this.activeSources.splice(index, 1);
        }
    };

    WebALContext.prototype.isSource = function (source) {
        if (source && source.__proto__.constructor == WebALSource) {
            return true;
        } else {
            return false;
        }
    };

    WebALContext.prototype.sourceParameter = function (source, pname, param) {
        if (!source) {
            this._setError(this.INVALID_NAME);
            return;
        }
        var needsUpdate = false;
        switch (pname) {
            case this.PITCH:
                if (param >= 0.0) {
                    source.pitch = param;
                    needsUpdate = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;
            case this.GAIN:
                if (param >= 0.0) {
                    source.gain = param;
                    needsUpdate = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;
            case this.MIN_GAIN:
                if ((param >= 0.0) && (param <= 1.0)) {
                    source.minGain = param;
                    needsUpdate = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;
            case this.MAX_GAIN:
                if ((param >= 0.0) && (param <= 1.0)) {
                    source.maxGain = param;
                    needsUpdate = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;
            case this.MAX_DISTANCE:
                if (param >= 0.0) {
                    source.maxDistance = param;
                    needsUpdate = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;
            case this.ROLLOFF_FACTOR:
                if (param >= 0.0) {
                    source.rolloffFactor = param;
                    needsUpdate = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;
            case this.CONE_OUTER_GAIN:
                if ((param >= 0.0) && (param <= 1.0)) {
                    source.outerGain = param;
                    needsUpdate = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;
            case this.CONE_INNER_ANGLE:
                if ((param >= 0.0) && (param <= 360.0)) {
                    source.innerAngle = param;
                    needsUpdate = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;
            case this.CONE_OUTER_ANGLE:
                if ((param >= 0.0) && (param <= 360.0)) {
                    source.outerAngle = param;
                    needsUpdate = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;
            case this.REFERENCE_DISTANCE:
                if (param >= 0.0) {
                    source.minDistance = param;
                    needsUpdate = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;

            case this.POSITION:
                if (param && (param.length == 3)) {
                    source.position[0] = param[0];
                    source.position[1] = param[1];
                    source.position[2] = param[2];
                    needsUpdate = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;
            case this.DIRECTION:
                if (param && (param.length == 3)) {
                    source.direction[0] = param[0];
                    source.direction[1] = param[1];
                    source.direction[2] = param[2];
                    needsUpdate = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;
            case this.VELOCITY:
                if (param && (param.length == 3)) {
                    source.velocity[0] = param[0];
                    source.velocity[1] = param[1];
                    source.velocity[2] = param[2];
                    needsUpdate = true;
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;

            case this.SOURCE_RELATIVE:
                if (param) {
                    source.sourceRelative = true;
                } else {
                    source.sourceRelative = false;
                }
                needsUpdate = true;
                break;

            case this.LOOPING:
                if (param) {
                    source.looping = true;
                } else {
                    source.looping = false;
                }
                needsUpdate = true;
                break;

            case this.BUFFER:
                // Should be using sourceBuffer instead
                this._setError(this.INVALID_OPERATION);
                break;

            case this.SEC_OFFSET:
            case this.SAMPLE_OFFSET:
            case this.BYTE_OFFSET:
                if (param >= 0) {
                    source.offsetType = pname;

                    if (pname == this.SEC_OFFSET) {
                        source.offset = Math.floor(param * 1000.0); // s->ms
                    } else {
                        source.offset = Math.floor(param);
                    }

                    if ((source.state == this.PLAYING) || (source.state == this.PAUSED)) {
                        if (!source._applyOffset()) {
                            this._setError(this.INVALID_VALUE);
                        }
                    }
                } else {
                    this._setError(this.INVALID_VALUE);
                }
                break;

            case this.SOURCE_TYPE:
            case this.SOURCE_STATE:
            case this.BUFFERS_QUEUED:
            case this.BUFFERS_PROCESSED:
                // Query only
                this._setError(this.INVALID_OPERATION);
                break;

            default:
                this._setError(this.INVALID_ENUM);
                break;
        }

        if (needsUpdate) {
            this.device.sourceUpdateRequested(source);
        }
    };

    WebALContext.prototype.getSourceParameter = function (source, pname) {
        if (!source) {
            this._setError(this.INVALID_NAME);
            return null;
        }
        switch (pname) {
            case this.PITCH:
                return source.pitch;
            case this.GAIN:
                return source.gain;
            case this.MIN_GAIN:
                return source.minGain;
            case this.MAX_GAIN:
                return source.maxGain;
            case this.MAX_DISTANCE:
                return source.maxDistance;
            case this.ROLLOFF_FACTOR:
                return source.rolloffFactor;
            case this.CONE_OUTER_GAIN:
                return source.outerGain;
            case this.CONE_INNER_ANGLE:
                return source.innerAngle;
            case this.CONE_OUTER_ANGLE:
                return source.outerAngle;
            case this.REFERENCE_DISTANCE:
                return source.minDistance;

            case this.POSITION:
                return source.position.slice();
            case this.DIRECTION:
                return source.direction.slice();
            case this.VELOCITY:
                return source.velocity.slice();
            case this.SOURCE_RELATIVE:
                return source.sourceRelative;

            case this.SOURCE_TYPE:
                return source.type;

            case this.LOOPING:
                return source.looping;
            case this.BUFFER:
                return source.buffer;
            case this.SOURCE_STATE:
                return source.state;

            case this.BUFFERS_QUEUED:
                return source.buffersQueued;
            case this.BUFFERS_PROCESSED:
                if (source.looping || (source.type != this.STREAMING)) {
                    // Looping buffers or non-streaming buffers don't get processed
                    return 0;
                } else {
                    return source.buffersProcessed;
                }

            case this.SEC_OFFSET:
            case this.SAMPLE_OFFSET:
            case this.BYTE_OFFSET:
                var updateLength = this.device.updateSize / this.device.frequency;
                var offsets = source._getSourceOffset(pname, updateLength);
                return offsets[0];

            default:
                this._setError(this.INVALID_ENUM);
                return null;
        }
    };

    WebALContext.prototype.sourcePlay = function (source) {
        if (!source) {
            this._setError(this.INVALID_NAME);
            return;
        }

        var oldState = source.state;

        // Check that there is a queue containing at least one buffer
        if (source.queue.length == 0) {
            source.state = this.STOPPED;
            source.buffersProcessed = source.buffersQueued;
            source.dataPosition = 0;
            source.dataPositionFrac = 0;
            source.offset = 0;
            this.device.sourceStateChange(source, oldState, source.state);
            return;
        }

        if (source.state != this.PAUSED) {
            // Starting fresh
            source.state = this.PLAYING;
            source.dataPosition = 0;
            source.dataPositionFrac = 0;
            source.buffersProcessed = 0;
            source.buffer = source.queue[0];
            this.device.sourceStateChange(source, oldState, source.state);
        } else {
            // Resume
            source.state = this.PLAYING;
        }

        // Apply any starting offset if required
        if (source.offset) {
            source._applyOffset();
        }

        // Add to active list if required
        if (this.activeSources.indexOf(source) == -1) {
            this.activeSources.push(source);
        }
    };

    WebALContext.prototype.sourceStop = function (source) {
        if (!source) {
            this._setError(this.INVALID_NAME);
            return;
        }

        var oldState = source.state;

        if (source.state != this.INITIAL) {
            source.state = this.STOPPED;
            source.buffersProcessed = source.buffersQueued;
            this.device.sourceStateChange(source, oldState, source.state);
        }
        source.offset = 0;
    };

    WebALContext.prototype.sourceRewind = function (source) {
        if (!source) {
            this._setError(this.INVALID_NAME);
            return;
        }

        var oldState = source.state;

        if (source.state != this.INITIAL) {
            source.state = this.INITIAL;
            source.dataPosition = 0;
            source.dataPositionFrac = 0;
            source.buffersProcessed = 0;
            if (source.queue.length > 0) {
                source.buffer = source.queue[0];
            }
            this.device.sourceStateChange(source, oldState, source.state);
        }
        source.offset = 0;
    };

    WebALContext.prototype.sourcePause = function (source) {
        if (!source) {
            this._setError(this.INVALID_NAME);
            return;
        }

        var oldState = source.state;

        if (source.state == this.PLAYING) {
            source.state = this.PAUSED;
            this.device.sourceStateChange(source, oldState, source.state);
        }
    };

    // -- Buffers --

    WebALContext.prototype.createBuffer = function () {
        var buffer = new WebALBuffer(this);

        this.buffers.push(buffer);

        return buffer;
    };

    WebALContext.prototype.deleteBuffer = function (buffer) {
        if (!buffer || !buffer.isAlive) {
            this._setError(this.INVALID_NAME);
            return;
        }

        if (buffer.referencingSources.length > 0) {
            // Sources still using this buffer - cannot delete
            this._setError(this.INVALID_OPERATION);
            return;
        }
        buffer.referencingSources.length = 0;

        buffer.data = null;
        buffer.isAlive = false;

        var index = this.buffers.indexOf(buffer);
        if (index >= 0) {
            this.buffers.splice(index, 1);
        }
    };

    WebALContext.prototype.isBuffer = function (buffer) {
        if (buffer && buffer.__proto__.constructor == WebALBuffer) {
            return true;
        } else {
            return false;
        }
    };

    WebALContext.prototype.bufferParameter = function (buffer, pname, param) {
        if (!buffer) {
            this._setError(this.INVALID_NAME);
            return;
        }
        switch (pname) {
            default:
                this._setError(this.INVALID_ENUM);
                break;
        }
    };

    WebALContext.prototype.getBufferParameter = function (buffer, pname) {
        if (!buffer) {
            this._setError(this.INVALID_NAME);
            return null;
        }
        switch (pname) {
            case this.LOADED:
                return buffer.data && (buffer.data.length > 0);
            case this.FREQUENCY:
                return buffer.frequency;
            case this.BITS:
                return buffer.bits;
            case this.CHANNELS:
                return buffer.channels;
            case this.SIZE:
                if (buffer.data) {
                    if (buffer.data.byteLength) {
                        return buffer.data.byteLength;
                    } else {
                        return 0;
                    }
                } else {
                    return 0;
                }
            default:
                this._setError(this.INVALID_ENUM);
                return null;
        }
    };

    WebALContext.prototype.bufferData = function (buffer) {
        // Supports:
        // bufferData(buffer, <audio>, streaming = false)
        // bufferData(buffer, format, data, frequency)
        if (!buffer) {
            this._setError(this.INVALID_NAME);
            return;
        }

        if ((arguments.length == 2) || (arguments.length == 3)) {
            // bufferData(buffer, <audio>, streaming = false)
            var audioEl = arguments[1];
            var streaming = false;
            if (arguments.length >= 3) {
                streaming = arguments[2] ? true : false;
            }
            buffer._setAudioData(audioEl, streaming);
        } else if (arguments.length == 4) {
            // bufferData(buffer, format, data, frequency)
            var format = arguments[1];
            var data = arguments[2];
            var frequency = arguments[3];

            if (data) {
                if ((data.length <= 0) || (frequency < 0)) {
                    this._setError(this.INVALID_VALUE);
                    return;
                }
            }

            buffer._setRawData(format, data, frequency);
        } else {
            this._setError(this.INVALID_VALUE);
            return;
        }
    };

    // -- Queueing --

    WebALContext.prototype.sourceBuffer = function (source, buffer) {
        if (!source) {
            this._setError(this.INVALID_NAME);
            return;
        }
        if ((source.state == this.PLAYING) || (source.state == this.PAUSED)) {
            // Cannot modify an active source
            this._setError(this.INVALID_OPERATION);
            return;
        }

        // Remove all elements in queue
        source._drainQueue();

        if (buffer) {
            source.type = this.STATIC;

            source.queue.push(buffer);
            source.buffersQueued = 1;

            // Increment reference count
            buffer.referencingSources.push(source);
            this.device.bindSourceBuffer(source, buffer);
        } else {
            source.type = this.UNDETERMINED;
        }

        source.buffersProcessed = 0;
        source.buffer = buffer;
        this.device.sourceUpdateRequested(source);
    };

    WebALContext.prototype.sourceQueueBuffers = function (source, buffers) {
        if (!source || !buffers || (buffers.length == 0)) {
            return;
        }
        if (source.type == this.STATIC) {
            // Not supported on static buffers
            this._setError(this.INVALID_OPERATION);
            return;
        }

        // Grab an existing buffer to compare against
        var existingBuffer = null;
        if (source.queue.length > 0) {
            existingBuffer = source.queue[0];
        }

        // Scan the given buffers and ensure they match up against the previous buffers
        for (var n = 0; n < buffers.length; n++) {
            var buffer = buffers[n];
            if (!buffer) {
                this._setError(this.INVALID_NAME);
                return;
            }

            if (existingBuffer) {
                // Compare old-vs-new
                if ((existingBuffer.frequency != buffer.frequency) ||
                    (existingBuffer.originalChannels != buffer.originalChannels) ||
                    (existingBuffer.originalType != buffer.originalType)) {
                    this._setError(this.INVALID_OPERATION);
                    return;
                }
            } else {
                this.device.sourceUpdateRequested(source);
            }
        }

        // Ready - add to the queue
        for (var n = 0; n < buffers.length; n++) {
            var buffer = buffers[n];
            buffer.referencingSources.push(source);
            this.device.bindSourceBuffer(source, buffer);
            source.queue.push(buffer);
        }

        if (!source.buffer) {
            source.buffer = source.queue[0];
        }

        source.type = this.STREAMING;
        source.buffersQueued += buffers.length;
    };
    WebALContext.prototype.sourceQueueBuffer = function (source, buffer) {
        this.sourceQueueBuffers(source, [buffer]);
    };

    WebALContext.prototype.sourceUnqueueBuffers = function (source, count) {
        if (!source || (count == 0)) {
            return [];
        }
        if (count < 0) {
            this._setError(this.INVALID_VALUE);
            return [];
        }
        if (source.looping || (source.type != this.STREAMING)) {
            // Looping and non-streaming buffers can't use the queue
            this._setError(this.INVALID_VALUE);
            return [];
        }
        if (count > source.buffersProcessed) {
            // Not enough processed buffers to satisfy the request
            this._setError(this.INVALID_VALUE);
            return [];
        }

        var buffers = [];

        for (var n = 0; n < count; n++) {
            var buffer = source.queue.shift();
            buffer.referencingSources.splice(buffer.referencingSources.indexOf(source), 1);
            this.device.unbindSourceBuffer(source, buffer);
            buffers.push(buffer);
            source.buffersQueued--;
        }

        if (source.state != this.PLAYING) {
            if (source.queue.length > 0) {
                source.buffer = source.queue[0];
            } else {
                source.buffer = null;
            }
        }
        source.buffersProcessed -= count;

        return buffers;
    };
    WebALContext.prototype.sourceUnqueueBuffer = function (source) {
        if (!source) {
            return null;
        }
        var buffers = this.sourceQueueBuffers(source, 1);
        if (buffers.length >= 1) {
            return buffers[0];
        } else {
            return null;
        }
    };

    exports.WebALContextAttributes = WebALContextAttributes;
    exports.WebALContext = WebALContext;

})();
(function () {
    var exports = window;

    var WebALListener = function (context) {
        WebALObject.apply(this, [context]);

        this.position = [0, 0, 0];
        this.velocity = [0, 0, 0];
        this.forward = [0, 0, -1];
        this.up = [0, 1, 0];
        this.gain = 1.0;
    };
    WebALListener.prototype = new WebALObject();
    WebALListener.prototype.constructor = WebALListener;

    exports.WebALListener = WebALListener;

})();
(function () {
    var exports = window;

    var uniqueBufferId = 0;

    var WebALBuffer = function (context) {
        WebALObject.apply(this, [context]);

        this.id = uniqueBufferId++;

        this.data = null;

        this.frequency = 0;
        this.originalChannels = 0;
        this.originalType = 0;
        this.channels = 0;
        this.type = 0;
        this.bits = 0;

        this.loopStart = 0;
        this.loopEnd = 0;

        this.isAudioSource = false;

        // Current sources using this buffer (used to track reference count as well as handle invalidations)
        this.referencingSources = [];
    };
    WebALBuffer.prototype = new WebALObject();
    WebALBuffer.prototype.constructor = WebALBuffer;

    WebALBuffer.prototype._unbindData = function () {
        if (this.isAudioSource) {
            this.context.device.abortAudioBuffer(this);
        }

        this.data = null;

        this.frequency = 0;
        this.originalChannels = 0;
        this.originalType = 0;
        this.channels = 0;
        this.type = 0;
        this.bits = 0;

        this.loopStart = 0;
        this.loopEnd = 0;

        this.isAudioSource = false;
    };

    WebALBuffer.prototype._invalidateSources = function () {
        var device = this.context.device;
        for (var n = 0; n < this.referencingSources.length; n++) {
            var source = this.referencingSources[n];
            device.sourceUpdateRequested(source);
        }
    };

    WebALBuffer.prototype._setAudioData = function (audioElement, streaming) {
        this._unbindData();

        if (!audioElement) {
            return;
        }

        this.data = new Array(0);

        this.isAudioSource = true;
        this.context.device.setupAudioBuffer(this, audioElement, streaming);
    };

    WebALBuffer.prototype._setRawData = function (sourceFormat, sourceData, frequency) {
        var al = this.context;
        this._unbindData();

        if (!sourceData) {
            return;
        }

        if (!this.context.supportDynamicAudio) {
            al._setError(al.INVALID_OPERATION);
            return;
        }

        var sourceChannels;
        var sourceType;
        switch (sourceFormat) {
            case al.FORMAT_MONO8:
                sourceChannels = 1;
                sourceType = UBYTE;
                break;
            case al.FORMAT_MONO16:
                sourceChannels = 1;
                sourceType = SHORT;
                break;
            case al.FORMAT_MONO_FLOAT32:
                sourceChannels = 1;
                sourceType = al.FLOAT;
                break;
            case al.FORMAT_STEREO8:
                sourceChannels = 2;
                sourceType = al.UBYTE;
                break;
            case al.FORMAT_STEREO16:
                sourceChannels = 2;
                sourceType = al.SHORT;
                break;
            case al.FORMAT_STEREO_FLOAT32:
                sourceChannels = 2;
                sourceType = al.FLOAT;
                break;
            default:
                al._setError(al.INVALID_ENUM);
                return;
        }

        // Always convert to FORMAT_xxx_FLOAT32
        var targetChannels = sourceChannels;
        var targetType = al.FLOAT;
        var targetFormat;
        switch (sourceChannels) {
            case 1:
                targetFormat = al.FORMAT_MONO_FLOAT32;
                break;
            case 2:
                targetFormat = al.FORMAT_STEREO_FLOAT32;
                break;
        }

        // Ensure the buffer contains only full samples
        if ((sourceData.byteLength % (sourceType * sourceChannels)) != 0) {
            al._setError(al.INVALID_VALUE);
            return;
        }

        // If the source and target parameters are equivalent, do a quick copy
        var targetData = null;
        if ((sourceChannels == targetChannels) && (sourceType == targetType) && (sourceFormat == targetFormat)) {
            // Copy

            targetData = new WebALFloatArray(sourceData);
        } else {
            // Convert

            // Allocate new storage
            var sampleCount = (sourceData.byteLength / sourceType);
            targetData = new WebALFloatArray(sampleCount);

            // Convert data
            // NOTE: we know we are always going to FLOAT32
            switch (sourceType) {
                case UBYTE:
                    for (var n = 0; n < sampleCount; n++) {
                        targetData[n] = (sourceData[n] - 128) * (1.0 / 127.0);
                    }
                    break;
                case SHORT:
                    for (var n = 0; n < sampleCount; n++) {
                        targetData[n] = sourceData[n] * (1.0 / 32767.0);
                    }
                    break;
            }
        }

        this.data = targetData;

        this.frequency = frequency;
        this.originalChannels = sourceChannels;
        this.originalType = sourceType;
        this.channels = targetChannels;
        this.type = targetType;
        this.bits = targetType * 8;

        this.loopStart = 0;
        this.loopEnd = targetData.byteLength / targetChannels / targetType;
    };

    exports.WebALBuffer = WebALBuffer;

})();
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
(function () {
    var exports = window;

    var WebALDevice = function (context, name) {
        this.context = context;
        this.name = name;

        this.channels = context ? context.attributes.channels : 0;
        this.frequency = context ? context.attributes.frequency : 0;
        this.updateSize = 1024; // TODO: better choice

        this.refreshInterval = context ? context.attributes.refreshInterval : 0;

        this.sourcesPendingUpdate = [];
    };

    WebALDevice.prototype.handleUpdates = function () {
        var al = this.context;

        // TODO: optimize away
        for (var n = 0; n < al.activeSources.length; n++) {
            var source = al.activeSources[n];
            if (source.state != al.PLAYING) {
                // No longer active
                al.activeSources.splice(n, 1);
                n--;
                continue;
            }
        }

        var requeuedSources = [];
        var source;
        while (source = this.sourcesPendingUpdate.shift()) {
            if (!source._update()) {
                // Another update is required - add to temp list so we don't loop forever
                requeuedSources.push(source);
            }
        };
        if (requeuedSources.length > 0) {
            this.sourcesPendingUpdate = requeuedSources;
        }
    };

    WebALDevice.prototype.sourceUpdateRequested = function (source) {
        if (source.needsUpdate) {
            return;
        } else {
            source.needsUpdate = true;
            this.sourcesPendingUpdate.push(source);
        }
    };

    WebALDevice.prototype.sourceStateChange = function (source, oldState, newState) {
        // Ignored
    };

    WebALDevice.prototype.bindSourceBuffer = function (source, buffer) {
        // Ignored
    };

    WebALDevice.prototype.unbindSourceBuffer = function (source, buffer) {
        // Ignored
    };

    exports.WebALDevice = WebALDevice;

})();
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

    var BUFFERSIZE = 4096;

    var WebALSoftwareMixer = function (context, device) {
        this.context = context;

        this.channels = device.channels;
        this.dryBuffer = new Array(MAXCHANNELS);
        for (var n = 0; n < MAXCHANNELS; n++) {
            this.dryBuffer[n] = new WebALFloatArray(BUFFERSIZE * this.channels);
        }

        this.scratchBuffer = new WebALFloatArray(STACK_DATA_SIZE / 4);

        this.channelMatrix = new Array(MAXCHANNELS);
        for (var n = 0; n < MAXCHANNELS; n++) {
            this.channelMatrix[n] = new WebALFloatArray(MAXCHANNELS);
        }

        var deviceChannels = device.channels;
        switch (deviceChannels) {
            case 1:
                this.channelMatrix[FRONT_CENTER][FRONT_CENTER] = 1.0;
                this.channelMatrix[FRONT_LEFT][FRONT_CENTER] = Math.sqrt(0.5);
                this.channelMatrix[FRONT_RIGHT][FRONT_CENTER] = Math.sqrt(0.5);
                break;
            case 2:
                this.channelMatrix[FRONT_LEFT][FRONT_LEFT] = 1.0;
                this.channelMatrix[FRONT_RIGHT][FRONT_RIGHT] = 1.0;
                this.channelMatrix[FRONT_CENTER][FRONT_LEFT] = Math.sqrt(0.5);
                this.channelMatrix[FRONT_CENTER][FRONT_RIGHT] = Math.sqrt(0.5);
                break;
        }
    };

    WebALSoftwareMixer.prototype.write = function (target, sampleCount) {
        var al = this.context;

        // Clear the mixing buffer
        for (var n = 0; n < MAXCHANNELS; n++) {
            for (var m = 0; m < sampleCount * this.channels; m++) {
                this.dryBuffer[n][m] = 0.0;
            }
        }

        // Mix in all samples
        for (var n = 0; n < al.activeSources.length; n++) {
            var source = al.activeSources[n];
            if (source.buffer.data.length == 0) {
                // Skip empty sources
                continue;
            }
            this.mixSource(source, sampleCount);
        }

        // Write to target
        var dryBuffer = this.dryBuffer;
        var targetOffset = 0;
        if (this.channels == 1) {
            // Mono
            for (var n = 0; n < sampleCount; n++) {
                var samp = 0.0;
                for (var c = 0; c < MAXCHANNELS; c++) {
                    samp += dryBuffer[c][n] * this.channelMatrix[c][FRONT_CENTER];
                }
                target[targetOffset++] = samp;
            }
        } else if (this.channels == 2) {
            // Stereo
            for (var n = 0; n < sampleCount; n++) {
                var samp;
                samp = 0.0;
                for (var c = 0; c < MAXCHANNELS; c++) {
                    samp += dryBuffer[c][n] * this.channelMatrix[c][FRONT_LEFT];
                }
                target[targetOffset++] = samp;
                samp = 0.0;
                for (var c = 0; c < MAXCHANNELS; c++) {
                    samp += dryBuffer[c][n] * this.channelMatrix[c][FRONT_RIGHT];
                }
                target[targetOffset++] = samp;
            }
        }
    };

    WebALSoftwareMixer.prototype.fillBuffer = function (target, sampleCapacity) {
        var al = this.context;

        // Scan for any active sources - if none (or none that have any data), abort
        var anyActiveSources = false;
        for (var n = 0; n < al.activeSources.length; n++) {
            var source = al.activeSources[n];
            if (source.buffer.data.length == 0) {
                // Skip empty sources
                continue;
            }
            anyActiveSources = true;
        }
        if (!anyActiveSources) {
            return false;
        }

        var samplesRemaining = sampleCapacity;
        while (samplesRemaining > 0) {
            var sampleCount = Math.min(samplesRemaining, BUFFERSIZE);

            this.write(target, sampleCount);

            samplesRemaining -= sampleCount;
        }

        return true;
    };

    function lerp(val1, val2, mu) {
        return val1 + (val2 - val1) * mu;
    };
    function cubic(val0, val1, val2, val3, mu) {
        var mu2 = mu * mu;
        var a0 = -0.5 * val0 + 1.5 * val1 + -1.5 * val2 + 0.5 * val3;
        var a1 = val0 + -2.5 * val1 + 2.0 * val2 + -0.5 * val3;
        var a2 = -0.5 * val0 + 0.5 * val2;
        var a3 = val1;
        return a0 * mu * mu2 + a1 * mu2 + a2 * mu + a3;
    };

    function sample_point32(data, dataByteOffset, step, frac) {
        return data[dataByteOffset / 4];
    };
    function sample_lerp32(data, dataByteOffset, step, frac) {
        return lerp(data[dataByteOffset / 4], data[dataByteOffset / 4 + step], frac * (1.0 / FRACTIONONE));
    };
    function sample_cubic32(data, dataByteOffset, step, frac) {
        var v0 = data[dataByteOffset / 4 - step];
        var v1 = data[dataByteOffset / 4];
        var v2 = data[dataByteOffset / 4 + step];
        var v3 = data[dataByteOffset / 4 + step + step];
        return cubic(v0, v1, v2, v3, frac * (1.0 / FRACTIONONE));
    };

    function lpFilter4PC(iir, offset, input) {
        var history = iir.history;
        var a = iir.coeff;
        var output = input;
        output = output + (history[offset + 0] - output) * a;
        output = output + (history[offset + 1] - output) * a;
        output = output + (history[offset + 2] - output) * a;
        output = output + (history[offset + 3] - output) * a;
        return output;
    }

    function mix_1(mixer, source, data, dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sampler) {
        var dryBuffer = mixer.dryBuffer;
        var increment = source.params.step;

        var scalar = 1 / mixer.channels;

        var pos = 0;
        var frac = dataPosFrac;

        // TODO: no allocs
        var dryFilter = source.params.iirFilter;
        var drySend = new Array(MAXCHANNELS);
        for (var c = 0; c < MAXCHANNELS; c++) {
            drySend[c] = source.params.dryGains[0][c];
        }

        for (var n = 0; n < bufferSize; n++) {
            // First order interpolator
            var value = sampler(data, pos * 4, 1, frac);

            // Direct path final mix buffer and panning
            value = lpFilter4PC(dryFilter, 0, value);
            for (var c = 0; c < MAXCHANNELS; c++) {
                dryBuffer[c][outPos] += value * drySend[c] * scalar;
            }

            frac += increment;
            pos += frac >> FRACTIONBITS;
            frac &= FRACTIONMASK;
            outPos++;
        }

        return [dataPosInt + pos, frac];
    };
    function mix_2(mixer, source, data, dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sampler) {
        var dryBuffer = mixer.dryBuffer;
        var increment = source.params.step;

        var pos = 0;
        var frac = dataPosFrac;

        // TODO: no allocs
        var dryFilter = source.params.iirFilter;
        var drySend = new Array(2);
        drySend[0] = new Array(MAXCHANNELS);
        drySend[1] = new Array(MAXCHANNELS);
        for (var n = 0; n < 2; n++) {
            for (var c = 0; c < MAXCHANNELS; c++) {
                drySend[n][c] = source.params.dryGains[n][c];
            }
        }

        for (var n = 0; n < bufferSize; n++) {
            for (var m = 0; m < 2; m++) {
                // First order interpolator
                var value = sampler(data, pos * 2 * 4 + m * 4, 2, frac);

                // Direct path final mix buffer and panning
                value = lpFilter4PC(dryFilter, m * 2, value);
                for (var c = 0; c < MAXCHANNELS; c++) {
                    dryBuffer[c][outPos] += value * drySend[m][c];
                }
            }

            frac += increment;
            pos += frac >> FRACTIONBITS;
            frac &= FRACTIONMASK;
            outPos++;
        }

        return [dataPosInt + pos, frac];
    };

    WebALSoftwareMixer.prototype.mixSource = function (source, sampleCount) {
        var al = this.context;

        // Source info
        var state = source.state;
        var buffersProcessed = source.buffersProcessed;
        var dataPosInt = source.dataPosition;
        var dataPosFrac = source.dataPositionFrac;
        var increment = source.params.step;
        var resampler = (increment == FRACTIONONE) ? POINT_RESAMPLER : source.resampler;

        // Buffer info
        var buffer = source.queue[0];
        var bufferChannels = buffer.channels;
        var bufferType = buffer.type;
        var frameSize = bufferChannels * bufferType;

        // Get the current buffer
        if (source.buffersProcessed < source.buffersQueued) {
            buffer = source.queue[source.buffersProcessed];
        } else {
            buffer = source.queue[0];
        }

        // TODO: find a way to eliminate the need for the scratch buffer
        // It's used to hold data from the source before resampling into the target
        var scratch = this.scratchBuffer;
        function clearScratch(destByteOffset, byteLength) {
            for (var n = destByteOffset / 4; n < destByteOffset / 4 + byteLength / 4; n++) {
                scratch[n] = 0;
            }
        };
        function writeScratch(destByteOffset, source, sourceByteOffset, byteLength) {
            var dx = destByteOffset / 4;
            var sx = sourceByteOffset / 4;
            for (var n = 0; n < byteLength / 4; n++, dx++, sx++) {
                scratch[dx] = source[sx];
            }
        };

        var outPos = 0;
        do {
            var bufferPrePadding = RESAMPLERPREPADDING[resampler];
            var bufferPadding = RESAMPLERPADDING[resampler];

            // Figure out how many buffer bytes will be needed
            var dataSize = sampleCount - outPos + 1;
            dataSize *= increment;
            dataSize += dataPosFrac + FRACTIONMASK;
            dataSize >>= FRACTIONBITS;
            dataSize += bufferPadding + bufferPrePadding;
            dataSize *= frameSize;

            var bufferSize = Math.min(dataSize, STACK_DATA_SIZE);
            bufferSize -= bufferSize % frameSize;

            var sourceDataOffset = 0;
            var sourceDataSize = 0;
            if (source.type == al.STATIC) {
                buffer = source.buffer;

                if (!source.looping || (dataPosInt >= buffer.loopEnd)) {
                    // Not looping

                    var pos = 0;
                    if (dataPosInt >= bufferPrePadding) {
                        pos = (dataPosInt - bufferPrePadding) * frameSize;
                    } else {
                        var dataSize1 = (bufferPrePadding - dataPosInt) * frameSize;
                        dataSize1 = Math.min(bufferSize, dataSize1);

                        clearScratch(sourceDataOffset + sourceDataSize, dataSize1);
                        sourceDataSize += dataSize1;
                        bufferSize -= dataSize1;

                        pos = 0;
                    }

                    // Copy what's left to play in the source buffer and clear the rest of the temp buffer
                    var dataSize1 = buffer.data.byteLength - pos;
                    dataSize1 = Math.min(bufferSize, dataSize1);

                    writeScratch(sourceDataOffset + sourceDataSize, buffer.data, pos, dataSize1);
                    sourceDataSize += dataSize1;
                    bufferSize -= dataSize1;

                    clearScratch(sourceDataOffset + sourceDataSize, bufferSize);
                    sourceDataSize += bufferSize;
                    bufferSize -= bufferSize;
                } else {
                    // Looping
                    var loopStart = buffer.loopStart;
                    var loopEnd = buffer.loopEnd;

                    var pos = 0;
                    if (dataPosInt >= loopStart) {
                        pos = dataPosInt - loopStart;
                        while (pos < bufferPrePadding) {
                            pos += loopEnd - loopStart;
                        }
                        pos -= bufferPrePadding;
                        pos += loopStart;
                        pos *= frameSize;
                    } else if (dataPosInt >= bufferPrePadding) {
                        pos = (dataPosInt - bufferPrePadding) * frameSize;
                    } else {
                        var dataSize1 = (bufferPrePadding - dataPosInt) * frameSize;
                        dataSize1 = Math.min(bufferSize, dataSize1);

                        clearScratch(sourceDataOffset + sourceDataSize, dataSize1);
                        sourceDataSize += dataSize1;
                        bufferSize -= dataSize1;

                        pos = 0;
                    }

                    // Copy what's left of this loop iteration then copy repeats of the loop section
                    var dataSize1 = loopEnd * frameSize - pos;
                    dataSize1 = Math.min(bufferSize, dataSize1);

                    writeScratch(sourceDataOffset + sourceDataSize, buffer.data, pos, dataSize1);
                    sourceDataSize += dataSize1;
                    bufferSize -= dataSize1;

                    var dataSize1 = (loopEnd - loopStart) * frameSize;
                    while (bufferSize > 0) {
                        dataSize1 = Math.min(bufferSize, dataSize1);

                        writeScratch(sourceDataOffset + sourceDataSize, buffer.data, loopStart + frameSize, dataSize1);
                        sourceDataSize += dataSize1;
                        bufferSize -= dataSize1;
                    }
                }
            } else {
                // Crawl the buffer queue to fill in the temp buffer
                var queueIndex = source.queue.indexOf(buffer);

                var pos = 0;
                if (dataPosInt >= bufferPrePadding) {
                    pos = (dataPosInt - bufferPrePadding) * frameSize;
                } else {
                    pos = (bufferPrePadding - dataPosInt) * frameSize;
                    while (pos > 0) {
                        if ((queueIndex == 0) && !source.looping) {
                            var dataSize1 = Math.min(bufferSize, pos);

                            clearScratch(sourceDataOffset + sourceDataSize, dataSize1);
                            sourceDataSize += dataSize1;
                            bufferSize -= dataSize1;

                            pos = 0;
                            break;
                        }

                        if (source.looping) {
                            queueIndex = source.queue.length - 1;
                        } else {
                            queueIndex--;
                        }

                        var bufferItr = source.queue[queueIndex];
                        if (bufferItr.data.byteLength > pos) {
                            pos = bufferItr.data.byteLength - pos;
                            break;
                        }
                        pos -= bufferItr.data.byteLength;
                    }
                }

                while ((queueIndex >= 0) && (queueIndex < source.queue.length) && (bufferSize > 0)) {
                    var bufferItr = source.queue[queueIndex];
                    var dataSize1 = bufferItr.data.byteLength;

                    // Skip the data already played
                    if (dataSize1 <= pos) {
                        pos -= dataSize1;
                    } else {
                        var dataOffset = pos;
                        dataSize1 -= pos;
                        pos -= pos;

                        dataSize1 = Math.min(bufferSize, dataSize1);
                        writeScratch(sourceDataOffset + sourceDataSize, buffer.data, dataOffset, dataSize1);
                        sourceDataSize += dataSize1;
                        bufferSize -= dataSize1;
                    }

                    queueIndex++;
                    var atEnd = (queueIndex >= source.queue.length);
                    if (atEnd && source.looping) {
                        queueIndex = 0;
                    } else if (atEnd) {
                        clearScratch(sourceDataOffset + sourceDataSize, bufferSize);
                        sourceDataSize += bufferSize;
                        bufferSize -= bufferSize;
                    }
                }
            }

            // Figure out how many samples we can mix
            dataSize = sourceDataSize / frameSize;
            dataSize -= bufferPadding + bufferPrePadding;
            dataSize <<= FRACTIONBITS;
            dataSize -= increment;
            dataSize -= dataPosFrac;

            bufferSize = Math.floor((dataSize + (increment - 1)) / increment);
            bufferSize = Math.min(bufferSize, (sampleCount - outPos));

            sourceDataOffset += bufferPrePadding * frameSize;
            switch (resampler) {
                case POINT_RESAMPLER:
                    switch (bufferChannels) {
                        case 1:
                            var r = mix_1(this, source, scratch, sourceDataOffset + dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sample_point32);
                            dataPosInt = r[0]; dataPosFrac = r[1];
                            break;
                        case 2:
                            var r = mix_2(this, source, scratch, sourceDataOffset + dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sample_point32);
                            dataPosInt = r[0]; dataPosFrac = r[1];
                            break;
                    }
                    break;
                case LINEAR_RESAMPLER:
                    switch (bufferChannels) {
                        case 1:
                            var r = mix_1(this, source, scratch, sourceDataOffset + dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sample_lerp32);
                            dataPosInt = r[0]; dataPosFrac = r[1];
                            break;
                        case 2:
                            var r = mix_2(this, source, scratch, sourceDataOffset + dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sample_lerp32);
                            dataPosInt = r[0]; dataPosFrac = r[1];
                            break;
                    }
                    break;
                case CUBIC_RESAMPLER:
                    switch (bufferChannels) {
                        case 1:
                            var r = mix_1(this, source, scratch, sourceDataOffset + dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sample_cubic32);
                            dataPosInt = r[0]; dataPosFrac = r[1];
                            break;
                        case 2:
                            var r = mix_2(this, source, scratch, sourceDataOffset + dataPosInt, dataPosFrac, outPos, sampleCount, bufferSize, sample_cubic32);
                            dataPosInt = r[0]; dataPosFrac = r[1];
                            break;
                    }
                    break;
                default:
                    break;
            }
            outPos += bufferSize;

            // Handle buffer queue and looping (if at end of queue)
            while (true) {
                var loopStart = buffer.loopStart;
                var loopEnd = buffer.loopEnd;
                var dataSize = buffer.data.byteLength / frameSize;
                if (dataSize > dataPosInt) {
                    // Still inside current buffer
                    break;
                }

                var queueIndex = source.queue.indexOf(buffer);
                if (queueIndex < source.queue.length - 1) {
                    // Move to next buffer
                    buffer = source.queue[queueIndex + 1];
                    buffersProcessed++;
                } else if (source.looping) {
                    // Loop
                    buffer = source.queue[0];
                    buffersProcessed = 0;
                    if (buffer.type == al.STATIC) {
                        dataPosInt = ((dataPosInt - loopStart) % (loopEnd - loopStart)) + loopStart;
                        break;
                    }
                } else {
                    // Finished
                    state = al.STOPPED;
                    buffer = source.queue[0];
                    buffersProcessed = source.buffersQueued;
                    dataPosInt = 0;
                    dataPosFrac = 0;
                    break;
                }

                dataPosInt -= dataSize;
            }

        } while ((state == al.PLAYING) && (outPos < sampleCount));

        // Update source info
        source.state = state;
        source.buffersProcessed = buffersProcessed;
        source.dataPosition = dataPosInt;
        source.dataPositionFrac = dataPosFrac;
        source.buffer = buffer;
    };

    exports.WebALSoftwareMixer = WebALSoftwareMixer;

})();
(function () {
    var exports = window;

    // A reference null output when nothing is supported
    var WebALNullDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Null"]);

        this.context.attributes.supportDynamicAudio = false;
        this.context.attributes.supportStreaming = false;
        this.context.attributes.support3D = false;
    };
    WebALNullDevice.prototype = new WebALDevice();
    WebALNullDevice.prototype.constructor = WebALNullDevice;

    WebALNullDevice.detect = function () {
        // Null device is always supported
        return true;
    };

    WebALNullDevice.create = function (context) {
        return new WebALNullDevice(context);
    };

    WebALNullDevice.prototype.setupAudioBuffer = function (buffer, audioElement, streaming) {
    };

    WebALNullDevice.prototype.abortAudioBuffer = function (buffer) {
    };

    exports.WebALNullDevice = WebALNullDevice;

})();
(function () {
    var exports = window;

    // A reference test output like null but still generates data
    var WebALTestDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Test"]);

        this.context.attributes.supportDynamicAudio = true;
        this.context.attributes.supportStreaming = true;
        this.context.attributes.support3D = true;

        var sampleCapacity = this.updateSize;
        this.buffer = new WebALFloatArray(sampleCapacity * this.channels);

        this.mixer = new WebALSoftwareMixer(context, this);

        window.setInterval(function () {
            self.handleUpdates();

            self.mixer.fillBuffer(self.buffer, sampleCapacity);

            // ?
        }, this.refreshInterval);
    };
    WebALTestDevice.prototype = new WebALDevice();
    WebALTestDevice.prototype.constructor = WebALTestDevice;

    WebALTestDevice.detect = function () {
        // Test device is always supported
        return true;
    };

    WebALTestDevice.create = function (context) {
        return new WebALTestDevice(context);
    };

    WebALTestDevice.prototype.setupAudioBuffer = function (buffer, audioElement, streaming) {
    };

    WebALTestDevice.prototype.abortAudioBuffer = function (buffer) {
    };

    exports.WebALTestDevice = WebALTestDevice;

})();
(function () {
    var exports = window;

    // An implementation using Flash for when HTML5 audio is not supported
    var WebALFlashDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Flash"]);

        this.context.attributes.supportDynamicAudio = true;
        this.context.attributes.supportStreaming = true;
        this.context.attributes.support3D = true;

        // Flash only supports 2 channel 44100hz, but we can handle the channel thing
        this.frequency = 44100;
        this.updateSize = 4096 / this.channels;

        this.sampleCapacity = this.updateSize;
        this.buffer = new WebALFloatArray(this.sampleCapacity * this.channels);

        this.bufferRequests = {};
        this.bufferRequestId = 0;

        // A list of calls waiting to execute when the flash is ready
        this.queuedCalls = [];

        this.mixer = new WebALSoftwareMixer(context, this);

        // Create a wrapper div in the document (Flash has to live somewhere)
        var wrapper = document.createElement("div");
        wrapper.style.position = "fixed";
        wrapper.style.width = wrapper.style.height = "8px";
        wrapper.style.left = wrapper.style.bottom = "0px";
        wrapper.style.overflow = "hidden";
        var container = document.createElement("div");
        container.id = "webal-flash-device";
        wrapper.appendChild(container);
        document.body.appendChild(wrapper);

        var hasInsertedFlash = false;
        function swfobjectReady() {
            if (hasInsertedFlash) {
                return;
            }
            hasInsertedFlash = true;

            // Load the SWF
            swfobject.embedSWF(
                "../../lib/webal_flash_device.swf",
                container.id,
                "8", "8",
                "10.0.0",
                null,
                null,
                { "allowScriptAccess": "always" },
                null,
                function (e) {
                    self.flashObject = document.getElementById("webal-flash-device");
                }
            );
        };

        // Load swfobject if required
        if (window["swfobject"]) {
            swfobjectReady();
        } else {
            var swfscript = document.createElement("script");
            swfscript.type = "text/javascript";
            swfscript.src = "http://ajax.googleapis.com/ajax/libs/swfobject/2.2/swfobject.js";
            swfscript.onreadystatechange = function () {
                if (!hasInsertedFlash && window["swfobject"]) {
                    swfobjectReady();
                }
            };
            swfscript.onload = swfobjectReady;
            document.getElementsByTagName("head")[0].appendChild(swfscript);
        }
    };
    WebALFlashDevice.prototype = new WebALDevice();
    WebALFlashDevice.prototype.constructor = WebALFlashDevice;

    WebALFlashDevice.detect = function () {
        // TODO: ensure Flash is enabled/etc
        return true;
    };

    WebALFlashDevice.create = function (context) {
        return new WebALFlashDevice(context);
    };

    WebALFlashDevice.prototype.setupAudioBuffer = function (buffer, audioElement, streaming) {
        var al = this.context;
        var self = this;

        buffer.frequency = 44100;
        buffer.originalChannels = buffer.channels = 2;
        buffer.originalType = buffer.type = al.FLOAT;
        buffer.bits = 32;

        function processAudioBuffer() {
            // Get a supported URL
            var url = null;
            if (audioElement instanceof Array) {
                // Audio reference list
                for (var n = 0; n < audioElement.length; n++) {
                    var source = audioElement[n];
                    if (source.type == "audio/mpeg") {
                        // Always prefer MP3
                        url = source.src;
                        break;
                    }
                }
            } else if ((typeof Audio !== "undefined") && (audioElement instanceof Audio)) {
                // Browser <audio> element
                var sources = audioElement.getElementsByTagName("source");
                if (sources && sources.length) {
                    for (var n = 0; n < sources.length; n++) {
                        var source = sources[n];
                        if (source.type == "audio/mpeg") {
                            // Always prefer MP3
                            url = source.src;
                            break;
                        }
                        url = source.src; // will use this if required, but probably won't work
                    }
                } else {
                    // Take the only thing we have
                    url = audioElement.src;
                }
            }

            // Queue and kick off the processing
            var bufferId = self.bufferRequestId++;
            self.bufferRequests[bufferId] = buffer;
            self.flashObject.getAllAudioSamples(bufferId, url);
        };

        if (this.flashObject && this.flashObject["getAllAudioSamples"]) {
            processAudioBuffer();
        } else {
            this.queuedCalls.push(processAudioBuffer);
        }
    };

    WebALFlashDevice.prototype.abortAudioBuffer = function (buffer) {
        // TODO: something?
    };

    // Called when the Flash widget is ready
    WebAL._flash_device_ready = function () {
        var al = WebAL.getContext();
        var device = al.device;

        // Set output channel info
        device.flashObject.setChannelCount(device.channels);

        var queuedCall;
        while (queuedCall = device.queuedCalls.shift()) {
            queuedCall();
        }
    };

    // Called by the Flash widget to populate data
    // Data is returned as *shudder* a string
    WebAL._flash_device_sampleQuery = function () {
        try {
            var al = WebAL.getContext();
            var device = al.device;

            device.handleUpdates();

            // Demand fill the buffer with samples
            if (device.mixer.fillBuffer(device.buffer, device.sampleCapacity) == false) {
                // Fast path for silence
                return null;
            }

            // Convert to string & return
            // TODO: faster - Typed Array's have no join() though
            var sampleString = "";
            for (var n = 0; n < device.buffer.length; n++) {
                sampleString += device.buffer[n];
                if (n < device.buffer.length - 1) {
                    sampleString += " ";
                }
            }
            return sampleString;
        } catch (e) {
            if (window["console"]) {
                console.log("Exception in Flash callback: " + e);
            }
            return null;
        }
    };

    // Called when the contenst of an audio file have been extracted
    WebAL._flash_device_completedAudioSamples = function (bufferId, channelCount, sampleCount, bufferString) {
        var al = WebAL.getContext();

        // Lookup the buffer
        var buffer = al.device.bufferRequests[bufferId];
        al.device.bufferRequests[bufferId] = null;

        buffer.originalChannels = buffer.channels = channelCount;
        buffer.data = new WebALFloatArray(sampleCount * channelCount);

        // TODO: faster conversion back to floats
        var bufferSplit = bufferString.split(" ");
        for (var n = 0; n < bufferSplit.length; n++) {
            buffer.data[n] = Number(bufferSplit[n]);
        }

        buffer.loopEnd = buffer.data.byteLength / buffer.channels / buffer.type;

        buffer._invalidateSources();
    };

    exports.WebALFlashDevice = WebALFlashDevice;

})();
(function () {
    var exports = window;

    // An implementation using the mozWriteAudio API
    var WebALNativeDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Native"]);

        this.context.attributes.supportDynamicAudio = true;
        this.context.attributes.supportStreaming = true;
        this.context.attributes.support3D = true;

        this.audioEl = new Audio();
        this.audioEl.mozSetup(this.channels, this.frequency);

        var sampleCapacity = this.updateSize;
        this.buffer = new WebALFloatArray(sampleCapacity * this.channels);

        this.mixer = new WebALSoftwareMixer(context, this);

        function writeData() {
            var buffer = self.buffer;
            while (self.audioEl.mozCurrentSampleOffset() / self.channels + prebufferSize >= currentWritePosition) {

                // HACK: DUMMY PULSE
                function writeDummyPulse(t) {
                    var k = 2 * Math.PI * 440 / self.frequency;
                    for (var i = 0; i < sampleCapacity; i++) {
                        buffer[i] = Math.sin(k * (i + t));
                    }
                }
                //writeDummyPulse(currentWritePosition);

                // Demand fill the buffer with samples
                if (self.mixer.fillBuffer(buffer, sampleCapacity) == false) {
                    // Silence - zero the buffer
                    for (var n = 0; n < buffer.length; n++) {
                        buffer[n] = 0.0;
                    }
                }

                self.audioEl.mozWriteAudio(buffer);
                currentWritePosition += sampleCapacity;
            }
        };

        // Prebuffer
        var currentWritePosition = 0;
        var prebufferSize = this.frequency / 2 / this.channels / 2;
        writeData();

        window.setInterval(function () {
            self.handleUpdates();

            writeData();
        }, this.refreshInterval);
    };
    WebALNativeDevice.prototype = new WebALDevice();
    WebALNativeDevice.prototype.constructor = WebALNativeDevice;

    WebALNativeDevice.detect = function () {
        // Ensure browser supports Audio with the Mozilla writing APIs
        if (typeof Audio !== "undefined") {
            var audio = new Audio();
            if (audio.mozSetup) {
                return true;
            }
        }
        return false;
    };

    WebALNativeDevice.create = function (context) {
        return new WebALNativeDevice(context);
    };

    WebALNativeDevice.prototype.setupAudioBuffer = function (buffer, audioElement, streaming) {
        var al = this.context;
        // https://developer.mozilla.org/en/Introducing_the_Audio_API_Extension

        var partialData = null;

        var audio = null;
        if (audioElement instanceof Array) {
            // Audio reference list
            audio = new Audio();
            for (var n = 0; n < audioElement.length; n++) {
                var ref = audioElement[n];
                var source = document.createElement("source");
                source.type = ref.type;
                source.src = ref.src;
                audio.appendChild(source);
            }
        } else if (audioElement instanceof Audio) {
            // Browser <audio> element
            audio = audioElement;
        }

        // TODO: to support streaming, we may want to use multiple buffers and queue them up
        // Not sure how well the rest of my hacky impl will support sub-realtime loading, though
        if (streaming) {
            // TODO: support streaming
        } else {
            // Static
        }

        function audioLoadedMetadata(e) {
            buffer.frequency = audio.mozSampleRate;
            buffer.originalChannels = buffer.channels = audio.mozChannels;
            buffer.originalType = buffer.type = al.FLOAT;
            buffer.bits = 32;

            // 98304 frames
            // 2.2160000801086426 duration
            // 1 channel
            // 44100 samplerate
            // 2.2xx*44100 = 97725.60353279113866
            var duration = audio.duration;
            var sampleCount = Math.round(duration * buffer.frequency);
            partialData = new WebALFloatArray(sampleCount);
        };

        var writeOffset = 0;
        function audioAvailable(e) {
            var fb = e.frameBuffer;

            var validSamples = Math.min(partialData.length - writeOffset, fb.length);
            for (var n = 0; n < validSamples; n++) {
                partialData[writeOffset + n] = fb[n];
            }

            writeOffset += fb.length;

            if (writeOffset > partialData.length) {
                // Done!
                buffer.data = partialData;
                buffer.loopEnd = buffer.data.byteLength / buffer.channels / buffer.type;

                buffer._invalidateSources();
            }
        };

        audio.addEventListener("loadedmetadata", audioLoadedMetadata, false);
        audio.addEventListener("MozAudioAvailable", audioAvailable, false);

        audio.muted = true;
        audio.play();
    };

    WebALNativeDevice.prototype.abortAudioBuffer = function (buffer) {
        // TODO: something? stop the audio element?
    };

    exports.WebALNativeDevice = WebALNativeDevice;

})();
(function () {
    var exports = window;

    var WebALBrowserMixer = function (context) {
        this.context = context;
    };


    var WebALBrowserAudio = function (audioRef) {
        this.audioRef = audioRef;
    };
    WebALBrowserAudio.prototype.createAudioElement = function () {
        var audio = new Audio();
        for (var n = 0; n < this.audioRef.length; n++) {
            var ref = this.audioRef[n];
            var source = document.createElement("source");
            source.type = ref.type;
            source.src = ref.src;
            audio.appendChild(source);
        }

        // Any settings?
        audio.load();

        return audio;
    };



    // Browser mixing using HTML5 audio
    var WebALBrowserDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Browser"]);

        this.context.attributes.supportDynamicAudio = false;
        this.context.attributes.supportStreaming = false;
        this.context.attributes.support3D = false;

        this.mixer = new WebALBrowserMixer(context);

        // Some browsers don't support 'loop' yet, so fake it
        this.manualLoop = (new Audio()).loop === undefined;

        //window.setInterval(function () {
        //self.handleUpdates();
        // ??
        //}, this.refreshInterval);
    };
    WebALBrowserDevice.prototype = new WebALDevice();
    WebALBrowserDevice.prototype.constructor = WebALBrowserDevice;

    WebALBrowserDevice.detect = function () {
        // Browser device requries HTML5 audio
        if (typeof Audio !== "undefined") {
            return true;
        } else {
            return false;
        }
    };

    WebALBrowserDevice.create = function (context) {
        return new WebALBrowserDevice(context);
    };

    // Override default updating behavior to happen on demand, not in a loop
    // This may cause a bit of extra work, but keeps things simple
    WebALBrowserDevice.prototype.sourceUpdateRequested = function (source) {
        var al = this.context;

        source.needsUpdate = true;
        source._update();

        // Get the current buffer
        var buffer;
        if (source.buffersProcessed < source.buffersQueued) {
            buffer = source.queue[source.buffersProcessed];
        } else {
            buffer = source.queue[0];
        }
        if (!buffer) {
            return;
        }
        var audio = source.audioElements[buffer.id];

        audio.loop = source.looping;

        // TODO: position

        // TODO: pitch

        // Calculate final gain
        var finalGain = 0;
        switch (this.channels) {
            case 1:
                finalGain = source.params.dryGains[0][2];
                break;
            case 2:
                var leftGain = source.params.dryGains[0][0];
                var rightGain = source.params.dryGains[0][1];
                finalGain = (Math.abs(leftGain) + Math.abs(rightGain)) / 2.0;
                break;
        }
        audio.volume = finalGain;
    };

    WebALBrowserDevice.prototype.sourceStateChange = function (source, oldState, newState) {
        var al = this.context;

        // Get the current buffer
        var buffer;
        if (source.buffersProcessed < source.buffersQueued) {
            buffer = source.queue[source.buffersProcessed];
        } else {
            buffer = source.queue[0];
        }
        if (!buffer) {
            return;
        }
        var audio = source.audioElements[buffer.id];

        function setTime(time) {
            try {
                audio.currentTime = 0;
            } catch (e) {
            }
        };

        switch (oldState) {
            case al.INITIAL:
                switch (newState) {
                    case al.INITIAL:
                        // No-op
                        break;
                    case al.PLAYING:
                        audio.play();
                        setTime(0);
                        break;
                    case al.PAUSED:
                        // Nothing
                        break;
                    case al.STOPPED:
                        // Nothing
                        break;
                }
                break;
            case al.PLAYING:
                switch (newState) {
                    case al.INITIAL:
                        setTime(0);
                        audio.pause();
                        break;
                    case al.PLAYING:
                        // Restart from beginning
                        setTime(0);
                        break;
                    case al.PAUSED:
                        audio.pause();
                        break;
                    case al.STOPPED:
                        setTime(0);
                        audio.pause();
                        break;
                }
                break;
            case al.PAUSED:
                switch (newState) {
                    case al.INITIAL:
                        setTime(0);
                        break;
                    case al.PLAYING:
                        audio.play();
                        break;
                    case al.PAUSED:
                        // No-op
                        break;
                    case al.STOPPED:
                        setTime(0);
                        break;
                }
                break;
            case al.STOPPED:
                switch (newState) {
                    case al.INITIAL:
                        setTime(0);
                        break;
                    case al.PLAYING:
                        audio.play();
                        break;
                    case al.PAUSED:
                        break;
                    case al.STOPPED:
                        // No-op
                        break;
                }
                break;
        }
    };

    WebALBrowserDevice.prototype.bindSourceBuffer = function (source, buffer) {
        var self = this;
        var al = this.context;
        if (!source.audioElements) {
            source.audioElements = {};
        }

        // Create a new audio element
        var audio = buffer.audio.createAudioElement();

        // Bind events for state changes
        function audioEnded(e) {
            if (source.looping) {
                if (self.manualLoop) {
                    audio.currentTime = 0;
                    audio.play();
                } else {
                    // Browser should auto-loop for us
                }
            } else {
                source.state = al.STOPPED;
            }
        };
        audio.addEventListener("ended", audioEnded, false);

        source.audioElements[buffer.id] = audio;
    };

    WebALBrowserDevice.prototype.unbindSourceBuffer = function (source, buffer) {
        var al = this.context;
        if (!source.audioElements) {
            return;
        }

        var audio = source.audioElements[buffer.id];
        source.audioElements[buffer.id] = null;

        // TODO: remove events
        audio.onended = null;

        // Unload?
        // TODO: kill somehow
        audio.pause();
    };

    WebALBrowserDevice.prototype.setupAudioBuffer = function (buffer, audioElement, streaming) {
        var al = this.context;

        var audioRef = null;
        var audio = null;
        if (audioElement instanceof Array) {
            // Audio reference list
            audio = new Audio();
            for (var n = 0; n < audioElement.length; n++) {
                var ref = audioElement[n];
                var source = document.createElement("source");
                source.type = ref.type;
                source.src = ref.src;
                audio.appendChild(source);
            }

            // Clone so that no one can change it
            audioRef = [];
            for (var n = 0; n < audioElement.length; n++) {
                var ref = audioElement[n];
                audioRef.push({
                    type: ref.type,
                    src: ref.src
                });
            }
        } else if (audioElement instanceof Audio) {
            // Browser <audio> element
            audio = audioElement;

            // Extract sources
            var sources = audioElement.getElementsByTagName("source");
            if (sources && sources.length) {
                for (var n = 0; n < sources.length; n++) {
                    var source = sources[n];
                    audioRef.push({
                        type: source.type,
                        src: source.src
                    });
                }
            } else {
                // Would be nice to know the type...
                audioRef.push({
                    type: source.type,
                    src: source.src
                });
            }
        }

        function audioLoadedMetadata(e) {
            buffer.frequency = 44100;
            buffer.originalChannels = buffer.channels = 1;
            buffer.originalType = buffer.type = al.FLOAT;
            buffer.bits = 32;

            // Dummy data
            buffer.data = new WebALFloatArray(4);

            var duration = audio.duration;
            var sampleCount = Math.round(duration * buffer.frequency);
            sampleCount = sampleCount - (sampleCount % 2);
            buffer.loopEnd = (sampleCount * 4) / buffer.channels / buffer.type;

            buffer._invalidateSources();
        };

        audio.addEventListener("loadedmetadata", audioLoadedMetadata, false);

        audio.load();

        buffer.audio = new WebALBrowserAudio(audioRef);
    };

    WebALBrowserDevice.prototype.abortAudioBuffer = function (buffer) {
        // TODO: something? stop the audio element?
    };

    exports.WebALBrowserDevice = WebALBrowserDevice;

})();
