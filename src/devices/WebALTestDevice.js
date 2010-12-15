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
