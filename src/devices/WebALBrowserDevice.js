(function () {
    var exports = window;

    var WebALBrowserMixer = function (context) {
        this.context = context;
    };




    // Browser mixing using HTML5 audio
    var WebALBrowserDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Browser"]);

        this.context.attributes.supportDynamicAudio = false;
        this.context.attributes.supportStreaming = false;
        this.context.attributes.support3D = false;

        this.mixer = new WebALBrowserMixer(context);

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

        source._update();

        // Get the current buffer
        var buffer;
        if (source.buffersProcessed < source.buffersQueued) {
            buffer = source.queue[source.buffersProcessed];
        } else {
            buffer = source.queue[0];
        }
        var audio = source.buffer.audioElement;

        audio.looping = source.looping;

        // TODO: position

        // TODO: pitch

        // Calculate final gain
        var finalGain;
        switch (buffer.channels) {
            case 1:
                finalGain = source.params.dryGains[0][2];
                break;
            case 2:
                finalGain = (source.params.dryGains[0][0] + source.params.dryGains[1][1]) / 2.0;
                break;
        }
        //audio.volume = finalGain
    };

    WebALBrowserDevice.prototype.sourceStateChange = function (source, oldState, newState) {
        var al = this.context;
        var audio = source.buffer.audioElement;

        switch (oldState) {
            case al.INITIAL:
                switch (newState) {
                    case al.INITIAL:
                        // No-op
                        break;
                    case al.PLAYING:
                        audio.currentTime = 0;
                        audio.play();
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
                        audio.pause();
                        audio.currentTime = 0;
                        break;
                    case al.PLAYING:
                        // Restart from beginning
                        audio.currentTime = 0;
                        audio.play();
                        break;
                    case al.PAUSED:
                        audio.pause();
                        break;
                    case al.STOPPED:
                        audio.pause();
                        audio.currentTime = 0;
                        break;
                }
                break;
            case al.PAUSED:
                switch (newState) {
                    case al.INITIAL:
                        audio.currentTime = 0;
                        break;
                    case al.PLAYING:
                        audio.play();
                        break;
                    case al.PAUSED:
                        // No-op
                        break;
                    case al.STOPPED:
                        audio.currentTime = 0;
                        break;
                }
                break;
            case al.STOPPED:
                switch (newState) {
                    case al.INITIAL:
                        audio.currentTime = 0;
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

    WebALBrowserDevice.prototype.setupAudioBuffer = function (buffer, audioElement, streaming) {
        var al = this.context;

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

        function audioLoadedMetadata(e) {
            buffer.frequency = 44100;
            buffer.originalChannels = buffer.channels = 2;
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

        // HACK:
        function audioEnded(e) {
            console.log("audio ended");
        };
        audio.addEventListener("ended", audioEnded, false);

        audio.load();

        buffer.audioElement = audio;
    };

    WebALBrowserDevice.prototype.abortAudioBuffer = function (buffer) {
        // TODO: something? stop the audio element?
    };

    exports.WebALBrowserDevice = WebALBrowserDevice;

})();
