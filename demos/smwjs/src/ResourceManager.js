(function () {
    var smw = smwnamespace("smw");

    var ResourceManager = function () {
        this.tileSets = {};
        this.backgrounds = {};
        this.skins = {};

        this.packPath = "resources/packs/Classic/";
    };

    ResourceManager.prototype.clear = function () {
        this.tileSets = {};
        this.backgrounds = {};
        this.skins = {};
    };

    ResourceManager.prototype.loadTileSet = function (name, callback) {
        var self = this;

        var existing = this.tileSets[name];
        if (existing) {
            setTimeout(function () {
                callback(existing);
            }, 0);
            return;
        }

        var url = this.packPath + "tilesets/" + name + "/";
        smw.TileSet.load(url, function (tileSet) {
            if (tileSet) {
                self.tileSets[name] = tileSet;
            } else {
            }
            callback(tileSet);
        });
    };

    ResourceManager.prototype.getTileSet = function (name) {
        return this.tileSets[name];
    };

    ResourceManager.prototype.loadBackground = function (name, callback) {
        var self = this;

        var existing = this.backgrounds[name];
        if (existing) {
            setTimeout(function () {
                callback(existing);
            }, 0);
            return;
        }

        var url = this.packPath + "backgrounds/" + name;
        var img = new Image();
        img.onload = function () {
            self.backgrounds[name] = img;
            callback(img);
        };
        img.onerror = function () {
            callback(null);
        };
        img.src = url;
    };

    ResourceManager.prototype.loadSkin = function (name, callback) {
        var self = this;

        var existing = this.skins[name];
        if (existing) {
            setTimeout(function () {
                callback(existing);
            }, 0);
            return;
        }

        var url = "resources/skins/" + name;
        var img = new Image();
        img.onload = function () {
            self.skins[name] = img;
            callback(img);
        };
        img.onerror = function () {
            callback(null);
        };
        img.src = url;
    };

    smw.ResourceManager = ResourceManager;

})();
