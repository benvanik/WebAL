// Hack to always define a console
if (!window["console"]) {
    window.console = { log: function () { } };
}


function smwnamespace(name) {
    var parts = name.split(".");
    var current = window;
    for (var n = 0; n < parts.length; n++) {
        var part = parts[n];
        current[part] = current[part] || {};
        current = current[part];
    }
    return current;
}

(function () {
    var util = smwnamespace("smw.util");

    function getFolderName(url) {
        var lastSlash = url.lastIndexOf("/");
        if (lastSlash == -1) {
            return url;
        } else if (lastSlash == url.length - 1) {
            url = url.substr(0, lastSlash);
        }
        lastSlash = url.lastIndexOf("/");
        if (lastSlash == -1) {
            return url;
        }
        return url.substr(lastSlash + 1);
    };

    function getFileName(url) {
        var lastSlash = url.lastIndexOf("/");
        if (lastSlash == -1) {
            return url;
        } else if (lastSlash == url.length - 1) {
            return "";
        }
        return url.substr(lastSlash + 1);
    };

    function getFileNameWithoutExtension(url) {
        var fileName = getFileName(url);
        var lastDot = fileName.lastIndexOf(".");
        if (lastDot == -1) {
            return fileName;
        }
        return fileName.substr(0, lastDot);
    };

    function loadBinaryData(url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        xhr.overrideMimeType("text/plain; charset=x-user-defined");
        xhr.send(null);
        if (xhr.status != 200) {
            callback(null);
        } else {
            callback(new BinaryReader(xhr.responseText));
        }
    };

    util.getFolderName = getFolderName;
    util.getFileName = getFileName;
    util.getFileNameWithoutExtension = getFileNameWithoutExtension;
    util.loadBinaryData = loadBinaryData;

})();
