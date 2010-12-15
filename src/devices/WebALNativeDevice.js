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
