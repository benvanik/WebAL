(function () {
    var exports = window;

    var WebALListener = function (context) {
        WebALObject.apply(this, [context]);

        this.position = [0, 0, 0];
        this.velocity = [0, 0, 0];
        this.forward = [0, 0, -1];
        this.up = [0, 1, 0];
        this.gain = 1.0;
    };
    WebALListener.prototype = new WebALObject();
    WebALListener.prototype.constructor = WebALListener;

    exports.WebALListener = WebALListener;

})();
