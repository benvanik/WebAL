(function () {
    var exports = window;

    // A reference null output when nothing is supported
    var WebALNullDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Null"]);

        var sampleCapacity = this.updateSize;
        this.buffer = new WebALFloatArray(sampleCapacity * this.channels);

        this.mixer = new WebALSoftwareMixer(context, this);

        window.setInterval(function () {
            context._handleUpdates();

            self.mixer.fillBuffer(self.buffer, sampleCapacity);

            // ?
        }, this.refreshInterval);
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
