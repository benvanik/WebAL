(function () {
    var exports = window;

    // Hacky support for browsers that don't support Typed Arrays yet
    var WebALFloatArray;
    if (typeof Float32Array !== "undefined") {
        WebALFloatArray = Float32Array;
    } else {
        WebALFloatArray = function (size) {
            var result = [];
            if (typeof size === "number") {
                if (size) {
                    // First expand to the right size then zero fill
                    result[size - 1] = 0.0;
                    for (var n = 0; n < size; n++) {
                        result[n] = 0.0;
                    }
                }
            } else {
                var source = size;
                if (source.length) {
                    result[source.length - 1] = 0.0;
                    for (var n = 0; n < source.length; n++) {
                        result[n] = source[n];
                    }
                }
            }
            result.byteLength = result.length * 4;
            return result;
        };
    }



    var WebAL = {
        sharedContext: null
    };

    WebAL.getContext = function (attributes) {
        if (WebAL.sharedContext) {
            return WebAL.sharedContext;
        } else {
            var attributes = {};

            // Check the URL for an override on the device
            var query = window.location.search;
            if (query.length > 0) {
                query = query.substr(1);
                var terms = query.split("&");
                for (var n = 0; n < terms.length; n++) {
                    var parts = terms[n].split("=");
                    if (parts[0] === "webal_device") {
                        attributes.device = parts[1];
                    }
                }
            }

            var attr = new WebALContextAttributes(attributes);
            var context = new WebALContext(attr);

            WebAL.sharedContext = context;

            return context;
        }
    };



    var WebALObject = function (context) {
        this.context = context;

        this.isAlive = true;
    };

    exports.WebALObject = WebALObject;



    exports.WebAL = WebAL;

    // HACK: only because I'm lazy
    exports.WebALFloatArray = WebALFloatArray;

})();
