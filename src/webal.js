(function () {
    var exports = window;

    var WebAL = {
        sharedContext: null
    };
    WebAL.getContext = function (attributes) {
        if (WebAL.sharedContext) {
            return WebAL.sharedContext;
        } else {
            var attr = new WebALContextAttributes(attributes);
            var context = new WebALContext(attr);

            WebAL.sharedContext = context;

            return context;
        }
    };

    var WebALContextAttributes = function (source) {
        this.frequency = (source && source.frequency) ? source.frequency : 44100;
        this.refreshInterval = (source && source.refreshInterval) ? source.refreshInterval : 16;
        this.channels = (source && source.channels) ? source.channels : 2;

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

        // TODO: query attributes from device?

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

        // TODO: pick a device based on support
        //this.device = new WebALBrowserDevice(this);
        //this.device = new WebALFlashDevice(this);
        if (window.navigator.userAgent.indexOf("Firefox") > 0) {
            this.device = new WebALNativeDevice(this);
        }

        // Fallback to null device
        if (!this.device) {
            this.device = new WebALNullDevice(this);
        }
    };

    var constants = {
        INVALID: -1,
        NONE: 0,
        FALSE: 0,
        TRUE: 1,

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

    WebALContext.prototype._handleUpdates = function () {
        for (var n = 0; n < this.activeSources.length; n++) {
            var source = this.activeSources[n];
            if (source.state != this.PLAYING) {
                // No longer active
                this.activeSources.splice(n, 1);
                n--;
                continue;
            }

            if (source.needsUpdate) {
                source._update();
            }
        }
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
                    source.needsUpdate = true;
                } else if (updateWorld) {
                    if (source.sourceRelative) {
                        source.needsUpdate = true;
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
                // No update required - the contents aren't changing
                if (param) {
                    source.looping = true;
                } else {
                    source.looping = false;
                }
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
            source.needsUpdate = true;
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

        // Check that there is a queue containing at least one buffer
        if (source.queue.length == 0) {
            source.state = this.STOPPED;
            source.buffersProcessed = source.buffersQueued;
            source.dataPosition = 0;
            source.dataPositionFrac = 0;
            source.offset = 0;
            // TODO: source state set
            return;
        }

        if (source.state != this.PAUSED) {
            // Starting fresh
            source.state = this.PLAYING;
            source.dataPosition = 0;
            source.dataPositionFrac = 0;
            source.buffersProcessed = 0;
            source.buffer = source.queue[0];
            // TODO: source state set
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

        if (source.state != this.INITIAL) {
            source.state = this.STOPPED;
            source.buffersProcessed = source.buffersQueued;
            // TODO: source state set
        }
        source.offset = 0;
    };

    WebALContext.prototype.sourceRewind = function (source) {
        if (!source) {
            this._setError(this.INVALID_NAME);
            return;
        }

        if (source.state != this.INITIAL) {
            source.state = this.INITIAL;
            source.dataPosition = 0;
            source.dataPositionFrac = 0;
            source.buffersProcessed = 0;
            if (source.queue.length > 0) {
                source.buffer = source.queue[0];
            }
            // TODO: source state set
        }
        source.offset = 0;
    };

    WebALContext.prototype.sourcePause = function (source) {
        if (!source) {
            this._setError(this.INVALID_NAME);
            return;
        }

        if (source.state == this.PLAYING) {
            source.state = this.PAUSED;
            // TODO: source state set
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
        } else {
            source.type = this.UNDETERMINED;
        }

        source.buffersProcessed = 0;
        source.buffer = buffer;
        source.needsUpdate = true;
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
                source.needsUpdate = true;
            }
        }

        // Ready - add to the queue
        for (var n = 0; n < buffers.length; n++) {
            var buffer = buffers[n];
            buffer.referencingSources.push(source);
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
    }

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



    var WebALObject = function (context) {
        this.context = context;

        this.isAlive = true;
    };

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

    var POINT_RESAMPLER = 0;
    var LINEAR_RESAMPLER = 1;
    var CUBIC_RESAMPLER = 2;
    var DEFAULT_RESAMPLER = LINEAR_RESAMPLER;

    var UBYTE = 1;
    var SHORT = 2;
    var FLOAT = 4;

    var WebALSource = function (context) {
        WebALObject.apply(this, [context]);

        this.needsUpdate = true;

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
        this.resampler = DEFAULT_RESAMPLER;

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
    };
    WebALSource.prototype = new WebALObject();
    WebALSource.prototype.constructor = WebALSource;

    WebALSource.prototype._drainQueue = function () {
        for (var n = 0; n < this.queue.length; n++) {
            var buffer = this.queue[n];
            buffer.referencingSources.splice(buffer.referencingSources.indexOf(this), 1);
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

    WebALSource.prototype._update = function () {
        if (!this.needsUpdate) {
            return;
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
        } else {
            // No buffers - try later
            this.needsUpdate = true;
        }
    };

    var MAXCHANNELS = 3; // L R C
    var FRONT_LEFT = 0;
    var FRONT_RIGHT = 1;
    var FRONT_CENTER = 2;
    var STACK_DATA_SIZE = 16384;
    var INT_MAX = 2147483647;
    var FRACTIONBITS = 14;
    var FRACTIONONE = (1 << FRACTIONBITS);
    var FRACTIONMASK = (FRACTIONONE - 1);
    var AIRABSORBGAINDBHF = -0.05;
    var LOWPASSFREQCUTOFF = 5000;

    var RESAMPLERPADDING = [0 /*point*/, 1 /*linear*/, 2 /*cubic*/];
    var RESAMPLERPREPADDING = [0 /*point*/, 0 /*linear*/, 1 /*cubic*/];

    function aluCrossproduct(v1, v2, ov) {
        ov[0] = v1[1] * v2[2] - v1[2] * v2[1];
        ov[0] = v1[2] * v2[0] - v1[0] * v2[2];
        ov[0] = v1[0] * v2[1] - v1[1] * v2[0];
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
        // TODO: optimize all this away? What should the values be?
        var speaker2chan;
        var speakerGain;
        switch (deviceChannels) {
            case 1:
                speaker2chan = [FRONT_CENTER];
                speakerGain = [0.0, 0.0, 1.0];
                break;
            case 2:
                speaker2chan = [FRONT_LEFT, FRONT_RIGHT];
                speakerGain = [1.0, 1.0];
                break;
        }
        for (var n = 0; n < deviceChannels; n++) {
            var chan = speaker2chan[n];
            var combinedGain = ambientGain + (speakerGain[chan] - ambientGain) * directionalGain;
            this.params.dryGains[0][chan] = dryGain * combinedGain;
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

    var WebALBuffer = function (context) {
        WebALObject.apply(this, [context]);

        this.data = null;

        this.frequency = 0;
        this.originalChannels = 0;
        this.originalType = 0;
        this.channels = 0;
        this.type = 0;
        this.bits = 0;

        this.loopStart = 0;
        this.loopEnd = 0;

        // Current sources using this buffer (used to track reference count as well as handle invalidations)
        this.referencingSources = [];
    };
    WebALBuffer.prototype = new WebALObject();
    WebALBuffer.prototype.constructor = WebALBuffer;

    WebALBuffer.prototype._unbindData = function () {
        if (this.data) {
            // If a previous audio element set, unbind
            // TODO: unbind
            //console.log("would unbind audio data");
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
    };

    WebALBuffer.prototype._invalidateSources = function () {
        for (var n = 0; n < this.referencingSources.length; n++) {
            var source = this.referencingSources[n];
            source.needsUpdate = true;
        }
    };

    WebALBuffer.prototype._setAudioData = function (audioElement, streaming) {
        var self = this;
        var al = this.context;
        this._unbindData();

        if (!audioElement) {
            return;
        }

        // TODO: setup bindings
        //console.log("would bind audio data");

        // TODO: listen for loadedmetadata event
        // TODO: listen for the MozAudioAvailable event
        // https://developer.mozilla.org/en/Introducing_the_Audio_API_Extension

        this.data = new Float32Array(0);

        var partialData = null;

        // TODO: to support streaming, we may want to use multiple buffers and queue them up
        // Not sure how well the rest of my hacky impl will support sub-realtime loading, though
        if (streaming) {
            // TODO: support streaming
        } else {
            // Static
        }

        function audioLoadedMetadata(e) {
            self.frequency = audioElement.mozSampleRate;
            self.originalChannels = self.channels = audioElement.mozChannels;
            self.originalType = self.type = FLOAT;
            self.bits = 32;

            // 98304 frames
            // 2.2160000801086426 duration
            // 1 channel
            // 44100 samplerate
            // 2.2xx*44100 = 97725.60353279113866
            var duration = audioElement.duration;
            var sampleCount = Math.round(duration * self.frequency);
            partialData = new Float32Array(sampleCount);
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
                self.data = partialData;
                self.loopEnd = self.data.byteLength / self.channels / self.type;

                self._invalidateSources();
            }
        };

        audioElement.addEventListener("loadedmetadata", audioLoadedMetadata, false);
        audioElement.addEventListener("MozAudioAvailable", audioAvailable, false);

        audioElement.muted = true;
        audioElement.play();
    };

    WebALBuffer.prototype._setRawData = function (sourceFormat, sourceData, frequency) {
        var al = this.context;
        this._unbindData();

        if (!sourceData) {
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
                sourceType = FLOAT;
                break;
            case al.FORMAT_STEREO8:
                sourceChannels = 2;
                sourceType = UBYTE;
                break;
            case al.FORMAT_STEREO16:
                sourceChannels = 2;
                sourceType = SHORT;
                break;
            case al.FORMAT_STEREO_FLOAT32:
                sourceChannels = 2;
                sourceType = FLOAT;
                break;
            default:
                al._setError(al.INVALID_ENUM);
                return;
        }

        // Always convert to FORMAT_xxx_FLOAT32
        var targetChannels = sourceChannels;
        var targetType = FLOAT;
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

            targetData = new Float32Array(sourceData);
        } else {
            // Convert

            // Allocate new storage
            var sampleCount = (sourceData.byteLength / sourceType);
            targetData = new Float32Array(sampleCount);

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



    var BUFFERSIZE = 4096;

    var WebALSoftwareMixer = function (context, device) {
        this.context = context;

        this.channels = device.channels;
        this.dryBuffer = new Array(MAXCHANNELS);
        for (var n = 0; n < MAXCHANNELS; n++) {
            this.dryBuffer[n] = new Float32Array(BUFFERSIZE * this.channels);
        }

        this.scratchBuffer = new Float32Array(STACK_DATA_SIZE / 4);
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
        for (var n = 0; n < sampleCount; n++) {
            for (var m = 0; m < this.channels; m++) {
                var samp = 0.0;
                for (var c = 0; c < MAXCHANNELS; c++) {
                    samp += dryBuffer[c][n]; // * device->ChannelMatrix[c][m];
                }
                target[targetOffset] = samp;
                targetOffset++;
            }
        }
    };

    WebALSoftwareMixer.prototype.fillBuffer = function (target, sampleCapacity) {
        var samplesRemaining = sampleCapacity;
        while (samplesRemaining > 0) {
            var sampleCount = Math.min(samplesRemaining, BUFFERSIZE);

            this.write(target, sampleCount);

            samplesRemaining -= sampleCount;
        }
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

                while ((queueIndex >= 0) && (queueIndex < source.queue.length - 1) && (bufferSize > 0)) {
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


    var WebALDevice = function (context, name) {
        this.context = context;
        this.name = name;

        this.channels = context ? context.attributes.channels : 0;
        this.frequency = context ? context.attributes.frequency : 0;
        this.updateSize = 1024; // TODO: better choice

        this.refreshInterval = context ? context.attributes.refreshInterval : 0;
    };

    var WebALNullDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Null"]);

        var sampleCapacity = this.updateSize;
        this.buffer = new Float32Array(sampleCapacity * this.channels);

        this.mixer = new WebALSoftwareMixer(context, this);

        window.setInterval(function () {
            context._handleUpdates();

            self.mixer.fillBuffer(self.buffer, sampleCapacity);

            // ?
        }, this.refreshInterval);
    };
    WebALNullDevice.prototype = new WebALDevice();
    WebALNullDevice.prototype.constructor = WebALNullDevice;

    // TODO: an implementation that only supports <audio> tags
    var WebALBrowserDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Browser"]);

        window.setInterval(function () {
            context._handleUpdates();
        }, this.refreshInterval);
    };
    WebALBrowserDevice.prototype = new WebALDevice();
    WebALBrowserDevice.prototype.constructor = WebALBrowserDevice;

    // TODO: an implementation using Flash for when HTML5 audio is not supported
    var WebALFlashDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Flash"]);

        this.mixer = new WebALSoftwareMixer(context, this);

        window.setInterval(function () {
            context._handleUpdates();
        }, this.refreshInterval);
    };
    WebALFlashDevice.prototype = new WebALDevice();
    WebALFlashDevice.prototype.constructor = WebALFlashDevice;

    // TODO: an implementation using the mozWriteAudio API
    var WebALNativeDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Native"]);

        this.audioEl = new Audio();
        this.audioEl.mozSetup(this.channels, this.frequency);

        var sampleCapacity = this.updateSize;
        this.buffer = new Float32Array(sampleCapacity * this.channels);

        this.mixer = new WebALSoftwareMixer(context, this);

        function writeData() {
            while (self.audioEl.mozCurrentSampleOffset() / self.channels + prebufferSize >= currentWritePosition) {

                // HACK: DUMMY PULSE
                function writeDummyPulse(t) {
                    var k = 2 * Math.PI * 440 / self.frequency;
                    for (var i = 0; i < sampleCapacity; i++) {
                        self.buffer[i] = Math.sin(k * (i + t));
                    }
                }
                //writeDummyPulse(currentWritePosition);

                // Demand fill the buffer with samples
                self.mixer.fillBuffer(self.buffer, sampleCapacity);

                self.audioEl.mozWriteAudio(self.buffer);
                currentWritePosition += sampleCapacity;
            }
        };

        // Prebuffer
        var currentWritePosition = 0;
        var prebufferSize = this.frequency / 2 / this.channels / 2;
        writeData();

        window.setInterval(function () {
            context._handleUpdates();

            writeData();
        }, this.refreshInterval);
    };
    WebALNativeDevice.prototype = new WebALDevice();
    WebALNativeDevice.prototype.constructor = WebALNativeDevice;




    exports.WebAL = WebAL;

})();
