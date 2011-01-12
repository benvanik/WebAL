(function () {
    var smw = smwnamespace("smw");

    var TileSet = function (name, surface, reader) {
        this.name = name;

        this.surface = surface;
        this.width = this.surface.width / TileSet.TILESIZE;
        this.height = this.surface.height / TileSet.TILESIZE;

        var typeCount = reader.readInt32();
        if ((typeCount <= 0) || (typeCount > 1024)) {
            throw "Invalid tile type count: " + typeCount;
        }

        this.tileTypes = [];
        this.tileTypes[typeCount - 1] = null;
        for (var n = 0; n < typeCount; n++) {
            this.tileTypes[n] = reader.readInt32();
        }
    };

    TileSet.TILESIZE = 32;

    TileSet.prototype.getTileType = function (tileCol, tileRow) {
        return this.tileTypes[tileCol + tileRow * this.width];
    };

    TileSet.load = function (path, callback) {
        var name = smw.util.getFolderName(path);

        var tileSetData = null;
        var tileSetSurface = null;

        function markFailure() {
            callback(null);
        };

        function checkComplete() {
            if (tileSetData && tileSetSurface) {
                var tileSet = new TileSet(name, tileSetSurface, tileSetData);
                callback(tileSet);
            }
        };

        var img = new Image();
        img.onload = function () {
            tileSetSurface = img;
            checkComplete();
        };
        img.onerror = function () {
            markFailure();
        };
        img.src = path + "/large.png";

        smw.util.loadBinaryData(path + "/tileset.tls", function (reader) {
            if (reader) {
                tileSetData = reader;
                checkComplete();
            } else {
                markFailure();
            }
        });
    };

    smw.TileSet = TileSet;

})();
