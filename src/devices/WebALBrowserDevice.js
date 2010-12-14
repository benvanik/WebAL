(function () {
    var exports = window;

    // Browser mixing using HTML5 audio
    var WebALBrowserDevice = function (context) {
        var self = this;
        WebALDevice.apply(this, [context, "Browser"]);

        this.context.attributes.supportDynamicAudio = false;
        this.context.attributes.supportStreaming = false;
        this.context.attributes.support3D = false;

        this.mixer = null;

        window.setInterval(function () {
            context._handleUpdates();

            // ?
        }, this.refreshInterval);
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

    WebALBrowserDevice.prototype.setupAudioBuffer = function (buffer, audioElement, streaming) {
    };

    WebALBrowserDevice.prototype.abortAudioBuffer = function (buffer) {
    };

    exports.WebALBrowserDevice = WebALBrowserDevice;

})();
