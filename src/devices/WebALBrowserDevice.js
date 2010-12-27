(function () {
    var exports = window;

    var WebALBrowserAudio = function (audioRef) {
        this.audioRef = audioRef;
    };
    WebALBrowserAudio.prototype.createAudioElement = function () {
        var audio = document.createElement("audio");
        
        // Quick scan to see if we have a fully supported type
        var hasSet = false;
        for (var n = 0; n < this.audioRef.length; n++) {
            var ref = this.audioRef[n];
            if (audio.canPlayType(ref.type)) {
                audio.src = ref.src;
                hasSet = true;
                break;
            }
        }
        
        // Otherwise, add all sources
        if (!hasSet) {
            for (var n = 0; n < this.audioRef.length; n++) {
                var ref = this.audioRef[n];
                var source = document.createElement("source");
                source.type = ref.type;
                source.src = ref.src;
                audio.appendChild(source);
            }
        }

        // Useful for debugging issues on iOS
        //document.body.appendChild(audio);
        //audio.controls = "controls";

        // Any settings?
        try { audio.load(); } catch (e) { }

        return audio;
    };



    // Browser mixing using HTML5 audio
    var WebALBrowserDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Browser"]);

        this.context.attributes.supportDynamicAudio = false;
        this.context.attributes.supportStereoMixing = false;

        // Some browsers don't support 'loop' yet, so fake it
        this.manualLoop = (document.createElement("audio")).loop === undefined;

        //window.setInterval(function () {
        //self.handleUpdates();
        // ??
        //}, this.refreshInterval);
    };
    WebALBrowserDevice.prototype = new WebALDevice();
    WebALBrowserDevice.prototype.constructor = WebALBrowserDevice;

    WebALBrowserDevice.detect = function () {
        // Browser device requries HTML5 audio
        var audio = document.createElement("audio");
        if (audio && audio.play !== undefined) {
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
        try{ audio.volume = finalGain; } catch (e) { }
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

        switch (oldState) {
            case al.INITIAL:
                switch (newState) {
                    case al.INITIAL:
                        // No-op
                        break;
                    case al.PLAYING:
                        // This hack is required to get Chrome to play nicely
                        setTimeout(function() {
                            try { audio.currentTime = 0; } catch (e) { }
                            try { audio.play(); } catch (e) { }
                            try { audio.currentTime = 0; } catch (e) { }
                        }, 0);
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
                        try { audio.pause(); } catch (e) { }
                        try { audio.currentTime = 0; } catch (e) { }
                        break;
                    case al.PLAYING:
                        // Restart from beginning
                        try { audio.currentTime = 0; } catch (e) { }
                        break;
                    case al.PAUSED:
                        try { audio.pause(); } catch (e) { }
                        break;
                    case al.STOPPED:
                        try { audio.pause(); } catch (e) { }
                        try { audio.currentTime = 0; } catch (e) { }
                        break;
                }
                break;
            case al.PAUSED:
                switch (newState) {
                    case al.INITIAL:
                        try { audio.currentTime = 0; } catch (e) { }
                        break;
                    case al.PLAYING:
                        try { audio.play(); } catch (e) { }
                        break;
                    case al.PAUSED:
                        // No-op
                        break;
                    case al.STOPPED:
                        try { audio.currentTime = 0; } catch (e) { }
                        break;
                }
                break;
            case al.STOPPED:
                switch (newState) {
                    case al.INITIAL:
                        try { audio.currentTime = 0; } catch (e) { }
                        break;
                    case al.PLAYING:
                        // This hack is required to get Chrome to play nicely
                        setTimeout(function() {
                            try { audio.currentTime = 0; } catch (e) { }
                            try { audio.play(); } catch (e) { }
                            try { audio.currentTime = 0; } catch (e) { }
                        }, 0);
                        break;
                    case al.PAUSED:
                        break;
                    case al.STOPPED:
                        // No-op
                        break;
                }
                break;
        }
        
        // Remove from active list if needed
        if (newState != al.PLAYING) {
            var index = al.activeSources.indexOf(source);
            if (index >= 0) {
                al.activeSources.splice(index, 1);
            }
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
                
                // Remove from active list if needed
                var index = al.activeSources.indexOf(source);
                if (index >= 0) {
                    al.activeSources.splice(index, 1);
                }
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
        try { audio.pause(); } catch (e) { }
    };

    WebALBrowserDevice.prototype.setupAudioBuffer = function (buffer, audioElement, streaming) {
        var al = this.context;

        var audioRef = null;
        var audio = null;
        if (audioElement instanceof Array) {
            // Audio reference list
            audio = document.createElement("audio");
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

        buffer.frequency = 44100;
        buffer.originalChannels = buffer.channels = 1;
        buffer.originalType = buffer.type = al.FLOAT;
        buffer.bits = 32;

        // Dummy data
        buffer.data = new WebALFloatArray(4);

        // TODO: hook audio 'error' event and 'canplaythrough' event for error/success

        function audioCanPlay(e) {
            var duration = audio.duration;
            var sampleCount = Math.round(duration * buffer.frequency);
            sampleCount = sampleCount - (sampleCount % 2);
            buffer.loopEnd = (sampleCount * 4) / buffer.channels / buffer.type;

            buffer._invalidateSources();
        };
        //audio.addEventListener("canplay", audioCanPlay, false);

        audio.load();

        buffer.audio = new WebALBrowserAudio(audioRef);
    };

    WebALBrowserDevice.prototype.abortAudioBuffer = function (buffer) {
        // TODO: something? stop the audio element?
    };

    exports.WebALBrowserDevice = WebALBrowserDevice;

})();
