(function () {
    var exports = window;

    // A reference null output when nothing is supported
    var WebALNullDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Null"]);

        this.context.attributes.supportDynamicAudio = false;
        this.context.attributes.supportStereoMixing = false;
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
