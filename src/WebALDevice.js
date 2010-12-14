(function () {
    var exports = window;

    var WebALDevice = function (context, name) {
        this.context = context;
        this.name = name;

        this.channels = context ? context.attributes.channels : 0;
        this.frequency = context ? context.attributes.frequency : 0;
        this.updateSize = 1024; // TODO: better choice

        this.refreshInterval = context ? context.attributes.refreshInterval : 0;
    };

    exports.WebALDevice = WebALDevice;

})();
