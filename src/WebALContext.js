(function () {
    var exports = window;

    var WebALContextAttributes = function (source) {
        this.frequency = (source && source.frequency) ? source.frequency : 44100;
        this.refreshInterval = (source && source.refreshInterval) ? source.refreshInterval : 16;
        this.channels = (source && source.channels) ? source.channels : 2;
        this.device = (source && source.device) ? source.device : null;
        this.supportDynamicAudio = (source && source.supportDynamicAudio !== undefined) ? source.supportDynamicAudio : true;
        this.supportStereoMixing = (source && source.supportStereoMixing !== undefined) ? source.supportStereoMixing : true;

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
            if (this.attributes.supportDynamicAudio || this.attributes.supportStereoMixing) {
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
