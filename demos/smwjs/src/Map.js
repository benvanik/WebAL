(function () {
    var smw = smwnamespace("smw");

    var TileSet = smw.TileSet;

    var TILESETANIMATED = -1;
    var TILESETNONE = -2;
    var NUMSPAWNAREATYPES = 6;
    var NUM_AUTO_FILTERS = 12;
    var NUMMAPHAZARDPARAMS = 5;

    var TileType = {
        NONSOLID: 0,
        SOLID: 1,
        SOLIDONTOP: 2,
        ICE: 3,
        DEATH: 4,
        DEATHONTOP: 5,
        DEATHONBOTTOM: 6,
        DEATHONLEFT: 7,
        DEATHONRIGHT: 8,
        ICEONTOP: 9,
        ICEDEATHONBOTTOM: 10,
        ICEDEATHONLEFT: 11,
        ICEDEATHONRIGHT: 12,
        SUPERDEATH: 13,
        SUPERDEATHTOP: 14,
        SUPERDEATHBOTTOM: 15,
        SUPERDEATHLEFT: 16,
        SUPERDEATHRIGHT: 17,
        PLAYERDEATH: 18,
        GAP: 19,

        MAX: 19
    };

    var TileFlag = {
        NONSOLID: 0,
        SOLID: 1,
        SOLIDONTOP: 2,
        ICE: 4,
        DEATHONTOP: 8,
        DEATHONBOTTOM: 16,
        DEATHONLEFT: 32,
        DEATHONRIGHT: 64,
        GAP: 128,
        HASDEATH: 8056,
        SUPERDEATHTOP: 256,
        SUPERDEATHBOTTOM: 512,
        SUPERDEATHLEFT: 1024,
        SUPERDEATHRIGHT: 2048,
        PLAYERDEATH: 4096,
        SUPERORPLAYERDEATHTOP: 4352,
        SUPERORPLAYERDEATHBOTTOM: 4608,
        SUPERORPLAYERDEATHLEFT: 5120,
        SUPERORPLAYERDEATHRIGHT: 6144,
        PLAYERORDEATHONBOTTOM: 4112
    };

    var Tile = function (tileSet, col, row) {
        this.tileSet = tileSet;
        this.col = col;
        this.row = row;
    };

    var MapTile = function (type, flags) {
        this.type = type;
        this.flags = flags;
    };

    var MapBlock = function (reader) {
        this.type = reader.readUInt8();
        this.hidden = reader.readUInt8() ? true : false;

        // ? NUM_BLOCK_SETTINGS
        this.settings = [];
    };

    var MapItem = function (reader) {
        this.type = reader.readInt32();
        this.x = reader.readInt32();
        this.y = reader.readInt32();
    };

    var MapHazard = function (reader) {
        this.type = reader.readInt32();
        this.x = reader.readInt32();
        this.y = reader.readInt32();

        this.iparam = [];
        this.dparam = [];
        for (var n = 0; n < NUMMAPHAZARDPARAMS; n++) {
            this.iparam = reader.readInt32();
        }
        for (var n = 0; n < NUMMAPHAZARDPARAMS; n++) {
            this.dparam = reader.readFloat();
        }
    };

    var Warp = function (reader) {
        this.direction = reader.readInt32();
        this.connection = reader.readInt32();
        this.id = reader.readInt32();
    };

    function allocateBlockArray(width, height, defaultValue) {
        var array = new Array(width);
        for (var n = 0; n < width; n++) {
            var row = array[n] = new Array(height);
            for (var m = 0; m < height; m++) {
                row[m] = defaultValue;
            }
        }
        return array;
    };

    function versionIsEqualOrAfter(version, targetVersion) {
        if (version[0] > targetVersion[0]) {
            return true;
        } else if (version[0] == targetVersion[0]) {
            if (version[1] > targetVersion[1]) {
                return true;
            } else if (version[1] == targetVersion[1]) {
                if (version[2] > targetVersion[2]) {
                    return true;
                } else if (version[2] == targetVersion[2]) {
                    return version[3] >= targetVersion[3];
                }
            }
        }
        return false;
    };

    function readString(reader, maxLength) {
        var length = reader.readInt32();
        if (length == 0) {
            return "";
        }
        var value = reader.readString(length);
        return value.substr(0, length - 1);
    };

    var Map = function (resourceManager, name, reader) {
        var self = this;

        this.name = name;
        this.background = null;

        this.cachedLayers = [];

        this.mapdata = allocateBlockArray(Map.WIDTH, Map.HEIGHT, null);
        for (var n = 0; n < Map.WIDTH; n++) {
            for (var m = 0; m < Map.HEIGHT; m++) {
                this.mapdata[n][m] = new Array(Map.LAYERS);
            }
        }
        this.mapdatatop = allocateBlockArray(Map.WIDTH, Map.HEIGHT, null);
        this.objectdata = allocateBlockArray(Map.WIDTH, Map.HEIGHT, null);
        this.blockdata = allocateBlockArray(Map.WIDTH, Map.HEIGHT, null);
        this.warpdata = allocateBlockArray(Map.WIDTH, Map.HEIGHT, null);

        this.nospawn = new Array(NUMSPAWNAREATYPES);
        for (var n = 0; n < NUMSPAWNAREATYPES; n++) {
            this.nospawn[n] = allocateBlockArray(Map.WIDTH, Map.HEIGHT, false);
        }

        this.mapItems = [];
        this.mapHazards = [];

        var version = [reader.readInt32(), reader.readInt32(), reader.readInt32(), reader.readInt32()];
        if ((version[0] != 1) && (version[1] != 8)) {
            throw "Unsupported map version: " + version[0] + "." + version[1] + "." + version[2] + "." + version[3];
        }
        this.version = version;

        var autoFilterValues = [];
        for (var n = 0; n < NUM_AUTO_FILTERS + 1; n++) {
            autoFilterValues[n] = reader.readInt32();
        }
        // TODO: autofilter?

        var tileSetCount = reader.readInt32();
        var tileSets = [];
        var maxTileSetID = 0;
        for (var n = 0; n < tileSetCount; n++) {
            var tileSetID = reader.readInt32();
            if (tileSetID > maxTileSetID) {
                maxTileSetID = tileSetID;
            }
            var name = readString(reader, 128);
            tileSets[tileSetID] = resourceManager.getTileSet(name);
        }

        for (var j = 0; j < Map.HEIGHT; j++) {
            for (var i = 0; i < Map.WIDTH; i++) {
                for (var k = 0; k < Map.LAYERS; k++) {
                    var tileSetID = reader.readInt8();
                    var tileCol = reader.readUInt8();
                    var tileRow = reader.readUInt8();
                    var tileSet = null;

                    if (tileSetID >= 0) {
                        // Ensure valid tileset
                        if (tileSetID > maxTileSetID) {
                            tileSetID = 0;
                        }
                        tileSet = tileSets[tileSetID];
                        // TODO: handle missing?

                        // Ensure in bounds
                        if ((tileCol < 0) || (tileCol >= tileSet.width)) {
                            tileCol = 0;
                        }
                        if ((tileRow < 0) || (tileRow >= tileSet.height)) {
                            tileRow = 0;
                        }
                    }

                    this.mapdata[i][j][k] = new Tile(tileSet, tileCol, tileRow);
                }

                this.objectdata[i][j] = new MapBlock(reader);
            }
        }

        // Read in background name
        var backgroundName = readString(reader, 128);
        resourceManager.loadBackground(backgroundName, function (backgroundImage) {
            self.background = backgroundImage;
        });

        // Read on/off switches
        var switches = [];
        for (var n = 0; n < 4; n++) {
            switches.push(reader.readInt32());
        }

        // Load platforms
        var platformCount = reader.readInt32();
        for (var n = 0; n < platformCount; n++) {
            // TODO: platform loading
            console.log("platform loading code not implemented");
        }

        // Load map items (carryable spikes and springs)
        var mapItemCount = reader.readInt32();
        for (var n = 0; n < mapItemCount; n++) {
            this.mapItems.push(new MapItem(reader));
        }

        // Load map hazards (fireball strings, rotodiscs, pirhana plants)
        var mapHazardCount = reader.readInt32();
        for (var n = 0; n < mapHazardCount; n++) {
            this.mapHazards.push(new MapHazard(reader));
        }

        // Optional eyecandy
        if (versionIsEqualOrAfter(version, [1, 8, 0, 2])) {
            var eyecandy0 = reader.readInt32();
            var eyecandy1 = reader.readInt32();
        }
        var eyecandy2 = reader.readInt32();

        // Music type
        var musicCategoryID = reader.readInt32();

        // Top map data
        var tileTypeConversion = [0, 1, 2, 5, 121, 9, 17, 33, 65, 6, 21, 37, 69, 3961, 265, 529, 1057, 2113, 4096];
        for (var j = 0; j < Map.HEIGHT; j++) {
            for (var i = 0; i < Map.WIDTH; i++) {
                var tileType = reader.readInt32();
                if ((tileType >= 0) && (tileType < TileType.MAX)) {
                    this.mapdatatop[i][j] = new MapTile(tileType, tileTypeConversion[tileType]);
                } else {
                    this.mapdatatop[i][j] = new MapTile(TileType.NONSOLID, TileFlag.NONSOLID);
                }

                this.warpdata[i][j] = new Warp(reader);

                for (var n = 0; n < NUMSPAWNAREATYPES; n++) {
                    this.nospawn[n][i][j] = reader.readUInt8() ? true : false;
                }
            }
        }

        // TODO: the rest
    };

    Map.loadTileSets = function (resourceManager, reader, callback) {
        var version = [reader.readInt32(), reader.readInt32(), reader.readInt32(), reader.readInt32()];
        if ((version[0] != 1) && (version[1] != 8)) {
            throw "Unsupported map version: " + version[0] + "." + version[1] + "." + version[2] + "." + version[3];
        }
        for (var n = 0; n < NUM_AUTO_FILTERS + 1; n++) {
            reader.readInt32();
        }

        var tileSets = [];
        var tileSetCount = reader.readInt32();
        for (var n = 0; n < tileSetCount; n++) {
            reader.readInt32();
            var name = readString(reader, 128);
            tileSets.push(name);
        }

        // Now have a list of all tilesets required - request them all
        var remainingCount = tileSets.length;
        var failureCount = 0;
        for (var n = 0; n < tileSets.length; n++) {
            resourceManager.loadTileSet(tileSets[n], function (tileSet) {
                remainingCount--;
                if (tileSet) {
                } else {
                    failureCount++;
                }

                if (remainingCount == 0) {
                    if (failureCount == 0) {
                        callback(true);
                    } else {
                        callback(false);
                    }
                }
            });
        }
    };

    Map.WIDTH = 20;
    Map.HEIGHT = 15;
    Map.LAYERS = 4;

    Map.prototype.tile = function (x, y) {
        return this.mapdatatop[x][y].flags;
    };

    Map.prototype.block = function (x, y) {
        return this.blockdata[x][y];
    };

    Map.prototype.drawBackground = function (ctx) {
        if (this.background) {
            ctx.drawImage(this.background, 0, 0);
        }
    };

    Map.prototype.draw = function (targetctx, layer) {

        if (this.cachedLayers[layer]) {
            targetctx.drawImage(this.cachedLayers[layer], 0, 0);
            return;
        }

        var canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;

        var frag = document.createDocumentFragment();
        frag.appendChild(canvas);

        this.cachedLayers[layer] = canvas;

        var ctx = canvas.getContext("2d");

        for (var i = 0; i < Map.WIDTH; i++) {
            for (var j = 0; j < Map.HEIGHT; j++) {
                var tile = this.mapdata[i][j][layer];
                if (!tile.tileSet) {
                    continue;
                }

                var sx = tile.col * TileSet.TILESIZE;
                var sy = tile.row * TileSet.TILESIZE;
                var dx = i * TileSet.TILESIZE;
                var dy = j * TileSet.TILESIZE;
                ctx.drawImage(tile.tileSet.surface, sx, sy, TileSet.TILESIZE, TileSet.TILESIZE, dx, dy, TileSet.TILESIZE, TileSet.TILESIZE);
            }
        }

        targetctx.drawImage(canvas, 0, 0);
    };

    Map.load = function (resourceManager, path, callback) {
        var name = smw.util.getFileNameWithoutExtension(path);

        var mapData = null;

        function markFailure() {
            callback(null);
        };

        function checkComplete() {
            if (mapData) {
                Map.loadTileSets(resourceManager, mapData, function (success) {
                    if (success) {
                        mapData.seek(0);
                        var map = new Map(resourceManager, name, mapData);
                        callback(map);
                    } else {
                        callback(null);
                    }
                });
            }
        };

        smw.util.loadBinaryData(path, function (reader) {
            if (reader) {
                mapData = reader;
                checkComplete();
            } else {
                markFailure();
            }
        });
    };

    smw.TileType = TileType;
    smw.TileFlag = TileFlag;
    smw.Map = Map;

})();
