(function () {
    var exports = window;

    // An implementation using Flash for when HTML5 audio is not supported
    var WebALFlashDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Flash"]);

        this.context.attributes.supportDynamicAudio = true;
        this.context.attributes.supportStereoMixing = true;

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
        try {
            if (window["ActiveXObject"] !== undefined) {
                var flashObject = new ActiveXObject('ShockwaveFlash.ShockwaveFlash');
                if (flashObject) {
                    return true;
                }
            } else {
                throw "";
            }
        } catch (e) {
            if (navigator.mimeTypes["application/x-shockwave-flash"] !== undefined) {
                return true;
            }
        }
        return false;
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
