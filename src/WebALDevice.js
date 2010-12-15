(function () {
    var exports = window;

    var WebALDevice = function (context, name) {
        this.context = context;
        this.name = name;

        this.channels = context ? context.attributes.channels : 0;
        this.frequency = context ? context.attributes.frequency : 0;
        this.updateSize = 1024; // TODO: better choice

        this.refreshInterval = context ? context.attributes.refreshInterval : 0;

        this.sourcesPendingUpdate = [];
    };

    WebALDevice.prototype.handleUpdates = function () {
        var al = this.context;

        // TODO: optimize away
        for (var n = 0; n < al.activeSources.length; n++) {
            var source = al.activeSources[n];
            if (source.state != al.PLAYING) {
                // No longer active
                al.activeSources.splice(n, 1);
                n--;
                continue;
            }
        }

        var requeuedSources = [];
        var source;
        while (source = this.sourcesPendingUpdate.shift()) {
            if (!source._update()) {
                // Another update is required - add to temp list so we don't loop forever
                requeuedSources.push(source);
            }
        };
        if (requeuedSources.length > 0) {
            this.sourcesPendingUpdate = requeuedSources;
        }
    };

    WebALDevice.prototype.sourceUpdateRequested = function (source) {
        if (source.needsUpdate) {
            return;
        } else {
            source.needsUpdate = true;
            this.sourcesPendingUpdate.push(source);
        }
    };

    WebALDevice.prototype.sourceStateChange = function (source, oldState, newState) {
        // Ignored
    };

    WebALDevice.prototype.bindSourceBuffer = function (source, buffer) {
        // Ignored
    };

    WebALDevice.prototype.unbindSourceBuffer = function (source, buffer) {
        // Ignored
    };

    exports.WebALDevice = WebALDevice;

})();
