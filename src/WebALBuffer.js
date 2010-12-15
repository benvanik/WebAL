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
