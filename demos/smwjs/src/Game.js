(function () {
    var smw = smwnamespace("smw");

    var Game = function (canvas) {
        var self = this;

        this.canvas = canvas;
        // Disable smoothing if possible
        var ctx = canvas.getContext("2d");
        ctx.mozImageSmoothingEnabled = false;

        this.resources = new smw.ResourceManager();

        this.display = new smw.display.Display2D(canvas);

        this.al = WebAL.getContext({
            supportDynamicAudio: false,
            supportStereoMixing: false
        });
        setupAudio(this);

        this.players = [];

        var resourcesRemaining = 0;
        function finishLoading() {
            if (resourcesRemaining > 0) {
                return;
            }

            for (var n = 0; n < self.players.length; n++) {
                var player = self.players[n];
                player.map = self.map;
            }

            self.start();
        }

        resourcesRemaining++;
        var skinName1 = "sgraff_Mario.png";
        smw.Player.create(this, this.resources, skinName1, function (player) {
            self.players.push(player);

            resourcesRemaining--;
            finishLoading();
        });
        resourcesRemaining++;
        var skinName2 = "sgraff_Toad.png";
        smw.Player.create(this, this.resources, skinName2, function (player) {
            self.players.push(player);

            resourcesRemaining--;
            finishLoading();
        });

        resourcesRemaining++;
        var mapPath = "resources/maps/0smw.map";
        //var mapPath = "resources/maps/mp1_above the clouds.map";
        smw.Map.load(this.resources, mapPath, function (map) {
            self.map = map;

            resourcesRemaining--;
            finishLoading();
        });

        setupKeyboardInput(this);
    };

    function setupAudio(game) {
        var al = game.al;

        var jumpBuffer = al.createBuffer();
        al.bufferData(jumpBuffer, [
            { type: "audio/mpeg", src: "resources/sounds/jump.mp3" },
            { type: "audio/ogg", src: "resources/sounds/jump.ogg" }
        ], false);
        var jumpSource0 = al.createSource();
        al.sourceBuffer(jumpSource0, jumpBuffer);
        var jumpSource1 = al.createSource();
        al.sourceBuffer(jumpSource1, jumpBuffer);

        var skidBuffer = al.createBuffer();
        al.bufferData(skidBuffer, [
            { type: "audio/mpeg", src: "resources/sounds/skid.mp3" },
            { type: "audio/ogg", src: "resources/sounds/skid.ogg" }
        ], false);
        var skidSource = al.createSource();
        al.sourceBuffer(skidSource, skidBuffer);
        al.sourceParameter(skidSource, al.LOOPING, true);

        var mipBuffer = al.createBuffer();
        al.bufferData(mipBuffer, [
            { type: "audio/mpeg", src: "resources/sounds/mip.mp3" },
            { type: "audio/ogg", src: "resources/sounds/mip.ogg" }
        ], false);
        var mipSource = al.createSource();
        al.sourceBuffer(mipSource, mipBuffer);

        game.sounds = {
            jump0: jumpSource0,
            jump1: jumpSource1,
            skid: skidSource,
            mip: mipSource,
            state: {
                skid: false
            }
        };
    };

    function setupKeyboardInput(game) {
        document.addEventListener("keydown", function (e) {
            var handled = false;
            switch (e.keyCode) {
                case 87: // w
                    game.players[0].inputState.up = true;
                    handled = true;
                    break;
                case 83: // s
                    game.players[0].inputState.down = true;
                    handled = true;
                    break;
                case 65: // a
                    game.players[0].inputState.left = true;
                    handled = true;
                    break;
                case 68: // d
                    game.players[0].inputState.right = true;
                    handled = true;
                    break;
                case 38: // up
                    game.players[1].inputState.up = true;
                    handled = true;
                    break;
                case 40: // down
                    game.players[1].inputState.down = true;
                    handled = true;
                    break;
                case 37: // left
                    game.players[1].inputState.left = true;
                    handled = true;
                    break;
                case 39: // right
                    game.players[1].inputState.right = true;
                    handled = true;
                    break;
            }
            if (handled) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, false);

        document.addEventListener("keyup", function (e) {
            var handled = false;
            switch (e.keyCode) {
                case 87: // w
                    game.players[0].inputState.up = false;
                    handled = true;
                    break;
                case 83: // s
                    game.players[0].inputState.down = false;
                    handled = true;
                    break;
                case 65: // a
                    game.players[0].inputState.left = false;
                    handled = true;
                    break;
                case 68: // d
                    game.players[0].inputState.right = false;
                    handled = true;
                    break;
                case 38: // up
                    game.players[1].inputState.up = false;
                    handled = true;
                    break;
                case 40: // down
                    game.players[1].inputState.down = false;
                    handled = true;
                    break;
                case 37: // left
                    game.players[1].inputState.left = false;
                    handled = true;
                    break;
                case 39: // right
                    game.players[1].inputState.right = false;
                    handled = true;
                    break;
            }
            if (handled) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, false);
    };

    Game.prototype.start = function () {
        var self = this;
        setInterval(function () {
            self.update();
            self.draw();
        }, 16);
    };

    Game.prototype.update = function () {
        var al = this.al;

        // Do player-player collision detection
        for (var n = 0; n < this.players.length; n++) {
            var player1 = this.players[n];
            for (var m = n + 1; m < this.players.length; m++) {
                var player2 = this.players[m];
                if (smw.Player.coldec_p2p(player1, player2)) {
                    smw.Player.collisionhandler_p2p(player1, player2)
                    //if player was killed by another player, continue with next player for collision detection
                    //if(player1->state <= player_dead)
                    //break;
                }
            }
        }

        this.sounds.state.skid = false;

        // Update all players
        for (var n = 0; n < this.players.length; n++) {
            var player = this.players[n];
            player.update();
        }

        // Sounds
        if (this.sounds.state.skid) {
            if (al.getSourceParameter(this.sounds.skid, al.SOURCE_STATE) != al.PLAYING) {
                al.sourcePlay(this.sounds.skid);
            }
        } else {
            al.sourceStop(this.sounds.skid);
        }
    };

    Game.prototype.playSound = function (name) {
        var al = this.al;

        var source = null;
        switch (name) {
            case "jump":
                source = this.sounds.jump0;
                if (al.getSourceParameter(source, al.SOURCE_STATE) == al.PLAYING) {
                    source = this.sounds.jump1;
                }
                break;
            case "mip":
                source = this.sounds.mip;
                break;
        }
        if (!source) {
            return;
        }

        al.sourcePlay(source);
    };

    Game.prototype.draw = function () {
        var ctx = this.canvas.getContext("2d");

        var map = this.map;

        map.drawBackground(ctx);

        map.draw(ctx, 0);

        map.draw(ctx, 1);

        map.draw(ctx, 2);

        map.draw(ctx, 3);

        for (var n = 0; n < this.players.length; n++) {
            var player = this.players[n];
            player.draw(ctx);
        }
    };

    smw.Game = Game;

})();
