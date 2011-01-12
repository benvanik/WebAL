(function () {
    var smw = smwnamespace("smw");

    var MAPWIDTH = smw.Map.WIDTH;
    var MAPHEIGHT = smw.Map.HEIGHT;
    var TILESIZE = smw.TileSet.TILESIZE;
    var TileFlag = smw.TileFlag;

    var VELMOVING = 4; // velocity for moving left/right
    var VELMOVINGADD = 0.5;
    var VELMOVINGADDICE = VELMOVINGADD / 4;
    var VELTURBOMOVING = 5.5;
    var VELJUMP = 9; // velocity for jumping
    var VELPUSHBACK = 5;
    var VELMOVINGFRICTION = 0.2;
    var VELICEFRICTION = 0.06;
    var VELAIRFRICTION = 0.06;
    var VELSTOPJUMP = 5;
    var BOUNCESTRENGTH = 0.5;

    var MAXVELY = 20;
    var MAXSIDEVELY = 10;

    var GRAVITATION = 0.40;

    var PW = 22; // Player width
    var PH = 25; // Player height
    var HALFPH = 12;
    var HALFPW = 11;
    var PHOFFSET = 4;
    var PWOFFSET = 5;

    var PGFX_STANDING_R = 0;
    var PGFX_STANDING_L = 1;
    var PGFX_RUNNING_R = 2;
    var PGFX_RUNNING_L = 3;
    var PGFX_JUMPING_R = 4;
    var PGFX_JUMPING_L = 5;
    var PGFX_STOPPING_R = 6;
    var PGFX_STOPPING_L = 7;
    var PGFX_DEADFLYING = 8;
    var PGFX_DEAD = 9;
    var PGFX_LAST = 10;

    function prepareSkin(skin) {
        // Given a skin image with:
        // PGFX_STANDING_R PGFX_RUNNING_R PGFX_JUMPING_R PGFX_STOPPING_R PGFX_DEADFLYING PGFX_DEAD
        // insert the 4 _L variants after the _R variants
        // We do this by creating a new canvas and drawing things in

        var canvas = document.createElement("canvas");
        canvas.width = PGFX_LAST * 32;
        canvas.height = 32;

        var frag = document.createDocumentFragment();
        frag.appendChild(canvas);

        var ctx = canvas.getContext("2d");

        ctx.drawImage(skin, 0 * 32, 0, 32, 32, PGFX_STANDING_R * 32, 0, 32, 32);
        ctx.drawImage(skin, 1 * 32, 0, 32, 32, PGFX_RUNNING_R * 32, 0, 32, 32);
        ctx.drawImage(skin, 2 * 32, 0, 32, 32, PGFX_JUMPING_R * 32, 0, 32, 32);
        ctx.drawImage(skin, 3 * 32, 0, 32, 32, PGFX_STOPPING_R * 32, 0, 32, 32);
        ctx.drawImage(skin, 4 * 32, 0, 32, 32, PGFX_DEADFLYING * 32, 0, 32, 32);
        ctx.drawImage(skin, 5 * 32, 0, 32, 32, PGFX_DEAD * 32, 0, 32, 32);

        ctx.save();
        ctx.translate(PGFX_STANDING_L * 32 + 64, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(skin, 0 * 32, 0, 32, 32, 32, 0, 32, 32);
        ctx.restore();
        ctx.save();
        ctx.translate(PGFX_RUNNING_L * 32 + 64, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(skin, 1 * 32, 0, 32, 32, 32, 0, 32, 32);
        ctx.restore();
        ctx.save();
        ctx.translate(PGFX_JUMPING_L * 32 + 64, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(skin, 2 * 32, 0, 32, 32, 32, 0, 32, 32);
        ctx.restore();
        ctx.save();
        ctx.translate(PGFX_STOPPING_L * 32 + 64, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(skin, 3 * 32, 0, 32, 32, 32, 0, 32, 32);
        ctx.restore();

        return canvas;
    };

    var Player = function (game, skin) {
        this.game = game;

        this.x = this.y = 0;
        this.velx = this.vely = 0;
        this.oldx = this.oldy = 0;

        this.isInAir = true;
        this.isOnIce = false;
        this.fallThrough = false;

        this.lockJump = true;
        this.lockFall = false;

        this.frictionSlideTimer = 0;

        this.animationState = 0;
        this.animationTimer = 0;
        this.srcOffsetX = 0;
        this.skin = prepareSkin(skin);
        this.spr = PGFX_STANDING_R;
        this.sprswitch = 0;

        this.invincible = false;
        this.invibleTimer = 0;

        this.inputState = {
            left: false,
            right: false,
            up: false,
            down: false
        };
    };

    function setSprite(p) {
        if (p.isInAir) {
            // Jumping
            p.frictionSlideTimer = 0;
            if (p.isFacingRight()) {
                p.spr = PGFX_JUMPING_R;
            } else {
                p.spr = PGFX_JUMPING_L;
            }
        } else {
            // Ground
            if (p.velx > 0) {
                // Moving right
                if (p.inputState.left && !p.inputState.right) {
                    p.spr = PGFX_STOPPING_R;
                    if (++p.frictionSlideTimer > 3) {
                        p.frictionSlideTimer = 0;
                        // TODO: eyecandy[1].add(new EC_SingleAnimation(&spr_frictionsmoke, ix, iy + PH - 12, 4, 4, 0, 0, 16, 16));
                    }
                } else {
                    if (p.isOnIce && !p.inputState.right && !p.inputState.left) {
                        p.spr = PGFX_STANDING_R;
                    } else {
                        if (--p.sprswitch < 1) {
                            if (p.spr == PGFX_STANDING_R) {
                                p.spr = PGFX_RUNNING_R;
                            } else {
                                p.spr = PGFX_STANDING_R;
                            }
                            p.sprswitch = 4;
                        } else {
                            if (p.spr & 0x1) {
                                p.spr = PGFX_STANDING_R;
                            }
                        }
                    }
                }
            } else if (p.velx < 0) {
                // Moving left
                if (p.inputState.right && !p.inputState.left) {
                    p.spr = PGFX_STOPPING_L;
                    if (++p.frictionSlideTimer > 3) {
                        p.frictionSlideTimer = 0;
                        // TODO: eyecandy[1].add(new EC_SingleAnimation(&spr_frictionsmoke, ix + PW - 16, iy + PH - 12, 4, 4, 0, 0, 16, 16));
                    }
                } else {
                    if (p.isOnIce && !p.inputState.right && !p.inputState.left) {
                        p.spr = PGFX_STANDING_L;
                    } else {
                        if (--p.sprswitch < 1) {
                            if (p.spr == PGFX_STANDING_L) {
                                p.spr = PGFX_RUNNING_L;
                            } else {
                                p.spr = PGFX_STANDING_L;
                            }
                            p.sprswitch = 4;
                        } else {
                            if (!(p.spr & 0x1)) {
                                p.spr = PGFX_STANDING_L;
                            }
                        }
                    }
                }
            } else {
                // Standing
                if (p.inputState.left) {
                    p.spr = PGFX_STANDING_L;
                } else if (p.inputState.right) {
                    p.spr = PGFX_STANDING_R;
                } else {
                    if (p.spr & 0x1) {
                        p.spr = PGFX_STANDING_L;
                    } else {
                        p.spr = PGFX_STANDING_R;
                    }
                }
            }
        }
    };

    Player.prototype.update = function () {
        if (this.invincible) {
            // playinvinciblesound = true;
        }

        this.srcOffsetX = 0;
        var colorChosen = false;
        if (this.invincible) {
            this.srcOffsetX = this.animationState;
            colorChosen = true;
        }

        if (this.invincible) {
            this.animationTimer++;
            if (((this.animationTimer > 3) && (this.invincibleTimer < 480)) || (this.animationTimer > 6)) {
                this.animationTimer = 0;
                this.animationState += 32;
                if (this.animationState > 96) {
                    this.animationState = 0;
                }
            }

            if (++this.invincibleTimer > 580) {
                this.animationState = 0;
                this.animationTimer = 0;
                this.invicibleTimer = 0;
                this.invisible = false;
            }
        }

        var lrn = 0; // move left/right -1 to 1
        if (this.inputState.right) {
            lrn++;
        }
        if (this.inputState.left) {
            lrn--;
        }
        if (this.inputState.up) {
            if (!this.isInAir) {
                // If on ground and jumping...
                var fellThrough = false;
                if (this.inputState.down) {
                    // Check if the player can fall through where they are standing
                    // TODO: line 1199
                }
                if (fellThrough) {
                    this.lockFall = true;
                    this.fallThrough = true;
                } else {
                    this.vely = -VELJUMP;
                    this.isInAir = true;
                    this.game.playSound("jump");
                }
                this.lockJump = true;
            }
        } else {
            // Jump key not pressed
            this.lockJump = false;
            if (this.vely < -VELSTOPJUMP) {
                vely = -VELSTOPJUMP;
            }
        }
        if (this.inputState.down) {
            if (!this.lockFall && !this.isInAir) {
                this.lockFall = true;
                this.fallThrough = true;
            }
        } else {
            this.lockFall = false;
        }

        if (lrn == 1) {
            if (this.isOnIce) {
                this.velx += VELMOVINGADDICE;
            } else {
                this.velx += VELMOVINGADD;
            }
            if (this.velx > VELMOVING) {
                this.velx = VELMOVING;
            }
            if (!this.isInAir) {
                if (this.velx < 0) {
                    this.game.sounds.state.skid = true;
                }
                // TODO: skid animation line 1531
            }
        } else if (lrn == -1) {
            if (this.isOnIce) {
                this.velx -= VELMOVINGADDICE;
            } else {
                this.velx -= VELMOVINGADD;
            }
            if (this.velx < -VELMOVING) {
                this.velx = -VELMOVING;
            }
            if (!this.isInAir) {
                if (this.velx > 0) {
                    this.game.sounds.state.skid = true;
                }
                // TODO: skid animation line 1584
            }
        } else {
            // Add air/ground friction
            if (this.velx > 0) {
                if (this.isInAir) {
                    this.velx -= VELAIRFRICTION;
                } else if (this.isOnIce) {
                    this.velx -= VELICEFRICTION;
                } else {
                    this.velx -= VELMOVINGFRICTION;
                }
                if (this.velx < 0) {
                    this.velx = 0;
                }
            } else if (this.velx < 0) {
                if (this.isInAir) {
                    this.velx += VELAIRFRICTION;
                } else if (this.isOnIce) {
                    this.velx += VELICEFRICTION;
                } else {
                    this.velx += VELMOVINGFRICTION;
                }
                if (this.velx > 0) {
                    this.velx = 0;
                }
            }
        }

        this.oldx = this.x;
        this.oldy = this.y;

        collision_detection_map(this);

        setSprite(this);
    };

    Player.prototype.bounceJump = function () {
        // Called when the player needs to bounce up
        if (this.inputState.up) {
            this.lockJump = true;
            this.vely = -VELJUMP;
            return true;
        } else {
            this.vely = -VELJUMP / 2;
            return false;
        }
    };

    function playerKilledPlayer(killer, killed) {
        if (killer == killed) {
            // Self kill
            // TODO: logic from 2622
            console.log("player killed self");
        } else {
            // TODO: logic from 2642
            console.log("player killed player");
        }
    };

    function mapKilledPlayer(killed) {
        // TODO: logic from 4220
        console.log("mapKilledPlayer");
    };

    Player.prototype.isStomping = function (otherPlayer) {
        if ((this.oldy + PH <= otherPlayer.oldy) && (this.y + PH >= otherPlayer.y)) {
            this.y = otherPlayer.y - PH; // Set new position to top of other player
            // TODO: collision_detection_checktop

            var killPotential = false;
            if (this.vely > 1) {
                killPotential = true;
            }

            this.bounceJump();

            if (killPotential) {
                // PlayerKilledPlayer(this, otherPlayer, death_style_squish, kill_style_stomp, false, false)
                playerKilledPlayer(this, otherPlayer);
            } else {
                // ?
            }
            return true;
        } else {
            return false;
        }
    };

    Player.coldec_p2p = function (o1, o2) {
        // Special cases to deal with players overlapping the right and left sides of the screen
        if (o1.x + PW < o2.x) {
            return o1.x + 640 < o2.x + PW && o1.x + PW + 640 >= o2.x && o1.y <= o2.y + PH && o1.y + PH >= o2.y;
        } else if (o2.x + PW < o1.x) {
            return o1.x < o2.x + PW + 640 && o1.x + PW >= o2.x + 640 && o1.y <= o2.y + PH && o1.y + PH >= o2.y;
        } else {
            // Normal case where no overlap
            return o1.x < o2.x + PW && o1.x + PW >= o2.x && o1.y <= o2.y + PH && o1.y + PH >= o2.y;
        }
    }
    /*
    function coldec_player2obj(o1, o2)
    {
    //Special cases to deal with players overlapping the right and left sides of the screen
    if(o1.x + PW < o2.x)
    {
    return o1.x + 640 < o2.x + o2->collisionWidth && o1.x + PW + 640 >= o2.x && o1.y < o2.y + o2->collisionHeight && o1.y + PH >= o2.y;
    }
    else if(o2.x + o2->collisionWidth < o1.x)
    {
    return o1.x < o2.x + o2->collisionWidth + 640 && o1.x + PW >= o2.x + 640 && o1.y < o2.y + o2->collisionHeight && o1.y + PH >= o2.y; 
    }
    else //Normal case where no overlap
    {
    return o1.x < o2.x + o2->collisionWidth && o1.x + PW >= o2.x && o1.y < o2.y + o2->collisionHeight && o2.y <= o1.y + PH;
    }
    }

    function coldec_obj2obj(o1, o2)
    {
    //Special cases to deal with players overlapping the right and left sides of the screen
    short o1r = o1.x + o1->collisionWidth;
    short o1b = o1.y + o1->collisionHeight;
    short o2r = o2.x + o2->collisionWidth;
    short o2b = o2.y + o2->collisionHeight;

    if(o1r < o2.x)
    {
    return o1.x + 640 < o2r && o1r + 640 >= o2.x && o1.y < o2b && o1b >= o2.y;
    }
    else if(o2r < o1.x)
    {
    return o1.x < o2r + 640 && o1r >= o2.x + 640 && o1.y < o2b && o1b >= o2.y;
    }
    else
    {
    return o1.x < o2r && o1r >= o2.x && o1.y < o2b && o1b >= o2.y;
    }
    }
    */

    Player.collisionhandler_p2p = function (o1, o2) {
        // Handles a collision between two players

        // Invincible
        if (o1.invincible && !o2.invincible) {
            //PlayerKilledPlayer(o1, o2, death_style_jump, kill_style_star, false, false);
            playerKilledPlayer(o1, o2);
            return;
        }
        if (o2.invincible && !o1.invincible) {
            //PlayerKilledPlayer(o2, o1, death_style_jump, kill_style_star, false, false);
            playerKilledPlayer(o2, o1);
            return;
        }

        // Stomping
        if (!o2.invincible && o1.isStomping(o2)) {
            return;
        }
        if (!o1.invincible && o2.isStomping(o1)) {
            return;
        }

        // Push back
        if (o1.x < o2.x) {
            // o1 is left -> o1 pushback left, o2 pushback right
            collisionhandler_p2p_pushback(o1, o2);
        } else {
            collisionhandler_p2p_pushback(o2, o1);
        }
    };

    function flipSidesIfNeeded(p) {
        if (p.x < 0) {
            p.x += 640;
            p.oldx += 640;
        } else if (p.x > 640) {
            p.x -= 640;
            p.oldx -= 640;
        }
    };

    function capFallingVelocity(vel) {
        if (vel > MAXVELY) {
            return MAXVELY;
        } else {
            return vel;
        }
    };

    function capSideVelocity(vel) {
        if (vel < -MAXSIDEVELY) {
            return -MAXSIDEVELY;
        } else if (vel > MAXSIDEVELY) {
            return MAXSIDEVELY;
        } else {
            return vel;
        }
    };

    function collisionhandler_p2p_pushback(o1, o2) {
        // Calculates the new positions for both players when they are pushing each other
        // o1 is left to o2

        var overlapCollision = false;
        if ((o1.x + PW < 320) && (o2.x > 320)) {
            overlapCollision = true;
        }

        if (overlapCollision) {
            var middle = o2.x - 640 + ((o1.x + PW) - o2.x - 640) / 2;
            o1.x = middle + 1;
            o2.x = middle - PW + 639;
            collision_detection_checkright(o1);
            collision_detection_checkleft(o2);
        } else {
            var middle = o2.x + ((o1.x + PW) - o2.x) / 2;
            o1.x = middle - PW - 1;
            o2.x = middle + 1;
            collision_detection_checkleft(o1);
            collision_detection_checkright(o2);
        }

        var absv1 = 0;
        var absv2 = 0;
        var p1pushback = 1.5;
        var p2pushback = 1.5;
        if (overlapCollision) {
            absv1 = (o1.velx < 0 ? o1.velx : -1) * p2pushback;
            absv2 = (o2.velx > 0 ? o2.velx : 1) * p1pushback;
        } else {
            absv1 = (o1.velx > 0 ? o1.velx : 1) * p2pushback;
            absv2 = (o2.velx < 0 ? o2.velx : -1) * p1pushback;
        }

        o1.velx = capSideVelocity(absv2);
        o2.velx = capSideVelocity(absv1);
    };

    function collision_detection_map(p) {
        var map = p.map;

        p.x += p.velx;
        flipSidesIfNeeded(p);

        var py = p.y + p.vely;

        if (py < 0) {
            // Out of bounds on the top of the screen
            p.y = py;
            p.vely = capFallingVelocity(GRAVITATION + p.vely);

            p.isInAir = true;
            p.isOnIce = false;
            p.fallThrough = false;
            return;
        } else if (py + PH >= 480) {
            // Out of bounds off the bottom of the screen
            p.y = -PH;
            p.oldy = -PH - 1;

            p.fallThrough = false;
            p.isOnIce = false;
            return;
        }

        var ty = Math.max(0, Math.floor(p.y / TILESIZE));
        var ty2 = Math.max(0, Math.floor((p.y + PH) / TILESIZE));
        var tx = -1;

        // x axis
        if (p.y + PH >= 0) {
            if (p.velx > 0.01) {
                // Moving right
                if (p.x + PW >= 640) {
                    tx = Math.floor((p.x + PW - 640) / TILESIZE);
                    p.oldx -= 640;
                } else {
                    tx = Math.floor((p.x + PW) / TILESIZE);
                }

                if (tx < 0) {
                    tx += MAPWIDTH;
                } else if (tx > MAPWIDTH - 1) {
                    tx -= MAPWIDTH;
                }

                var topTile = map.tile(tx, ty);
                var bottomTile = map.tile(tx, ty2);
                var topBlock = map.block(tx, ty);
                var bottomBlock = map.block(tx, ty2);

                var deathTileToLeft =
                    ((topTile & TileFlag.DEATHONLEFT) && (bottomTile & TileFlag.DEATHONLEFT)) ||
                    ((topTile & TileFlag.DEATHONLEFT) && !(bottomTile & TileFlag.SOLID)) ||
                    (!(topTile & TileFlag.SOLID) && (bottomTile & TileFlag.DEATHONLEFT));
                var superDeathTileToLeft =
                    ((topTile & TileFlag.SUPERORPLAYERDEATHLEFT) && (bottomTile & TileFlag.SUPERORPLAYERDEATHLEFT)) ||
                    ((topTile & TileFlag.SUPERORPLAYERDEATHLEFT) && !(bottomTile & TileFlag.SOLID)) ||
                    (!(topTile & TileFlag.SOLID) && (bottomTile & TileFlag.SUPERORPLAYERDEATHLEFT));
                var topBlockSolid = false; // topBlock && !topBlock.isTransparent() && !topBlock.isHidden();
                var bottomBlockSolid = false; // bottomBlock && !bottomBlock.isTransparent() && !bottomBlock.isHidden();

                if (topBlockSolid || bottomBlockSolid) {
                    if (topBlockSolid) {
                        // Collide with top block
                        // TODO: logic from 3714
                    }
                    if (bottomBlockSolid) {
                        // Collide with bottom block
                        // TODO: logic from 3726
                    }
                } else if (superDeathTileToLeft || (deathTileToLeft && !p.invincible)) {
                    //if(player_kill_nonkill != KillPlayerMapHazard(fSuperDeathTileToLeft, kill_style_environment, false))
                    if (mapKilledPlayer(p)) {
                        return;
                    }
                } else if ((topTile & TileFlag.SOLID) || (bottomTile & TileFlag.SOLID)) {
                    // Collide with solid, ice, and death and all sides death
                    p.x = ((tx << 5) - PW) - 0.2; // Move to the edge of the tile (tile on the right -> mind the player width)
                    p.oldx = p.x;
                    if (p.velx > 0) {
                        p.velx = 0;
                    }
                    flipSidesIfNeeded(p);
                }
            } else if (p.velx < -0.01) {
                // Moving left
                tx = Math.floor(p.x / TILESIZE);

                if (tx < 0) {
                    tx += MAPWIDTH;
                } else if (tx > MAPWIDTH - 1) {
                    tx -= MAPWIDTH;
                }

                var topTile = map.tile(tx, ty);
                var bottomTile = map.tile(tx, ty2);
                var topBlock = map.block(tx, ty);
                var bottomBlock = map.block(tx, ty2);

                var deathTileToRight =
                    ((topTile & TileFlag.DEATHONRIGHT) && (bottomTile & TileFlag.DEATHONRIGHT)) ||
                    ((topTile & TileFlag.DEATHONRIGHT) && !(bottomTile & TileFlag.SOLID)) ||
                    (!(topTile & TileFlag.SOLID) && (bottomTile & TileFlag.DEATHONRIGHT));
                var superDeathTileToRight =
                    ((topTile & TileFlag.SUPERORPLAYERDEATHRIGHT) && (bottomTile & TileFlag.SUPERORPLAYERDEATHRIGHT)) ||
                    ((topTile & TileFlag.SUPERORPLAYERDEATHRIGHT) && !(bottomTile & TileFlag.SOLID)) ||
                    (!(topTile & TileFlag.SOLID) && (bottomTile & TileFlag.SUPERORPLAYERDEATHRIGHT));
                var topBlockSolid = false; // topBlock && !topBlock.isTransparent() && !topBlock.isHidden();
                var bottomBlockSolid = false; // bottomBlock && !bottomBlock.isTransparent() && !bottomBlock.isHidden();

                if (topBlockSolid || bottomBlockSolid) {
                    if (topBlockSolid) {
                        // Collide with top block
                        // TODO: logic from 3805
                    }
                    if (bottomBlockSolid) {
                        // Collide with bottom block
                        // TODO: logic from 3819
                    }
                } else if (superDeathTileToRight || (deathTileToRight && !p.invincible)) {
                    //if(player_kill_nonkill != KillPlayerMapHazard(fSuperDeathTileToRight, kill_style_environment, false))
                    if (mapKilledPlayer(p)) {
                        return;
                    }
                } else if ((topTile & TileFlag.SOLID) || (bottomTile & TileFlag.SOLID)) {
                    // Collide with solid, ice, and death and all sides death
                    p.x = ((tx << 5) + TILESIZE) - 0.2; // Move to the edge of the tile
                    p.oldx = p.x;
                    if (p.velx < 0) {
                        p.velx = 0;
                    }
                    flipSidesIfNeeded(p);
                }
            }
        }

        // y axis
        var pl = p.x;
        var pc = p.x + HALFPW;
        var pr = p.x + PW;
        if (pl < 0) {
            pl += 640;
        } else if (pl >= 640) {
            pl -= 640;
        }
        if (pc >= 640) {
            pc -= 640;
        }
        if (pr >= 640) {
            pr -= 640;
        }
        var txl = Math.floor(pl / TILESIZE);
        var txc = Math.floor(pc / TILESIZE);
        var txr = Math.floor(pr / TILESIZE);
        var alignedBlockX = 0;
        var unalignedBlockX = 0;
        var unalignedBlockFX = 0;
        var overlaptxl = (txl << 5) + TILESIZE + 1;
        if (p.x + HALFPW < overlaptxl) {
            alignedBlockX = txl;
            unalignedBlockX = txr;
            unalignedBlockFX = ((txr << 5) - PW) - 0.2;
        } else {
            alignedBlockX = txr;
            unalignedBlockX = txl;
            unalignedBlockFX = ((txl << 5) + TILESIZE) + 0.2;
        }
        var movingUp = p.vely;
        if (movingUp < -0.01) {
            // Moving up
            p.fallThrough = false;
            ty = Math.floor(py / TILESIZE);

            var leftBlock = map.block(txl, ty);
            var centerBlock = map.block(txc, ty);
            var rightBlock = map.block(txr, ty);

            if (centerBlock && !centerBlock.isTransparent()) {
                // TODO: logic from 3930
            }

            var alignedTile = map.tile(alignedBlockX, ty);
            if ((alignedTile & TileFlag.SOLID) && !(alignedTile & TileFlag.SUPERORPLAYERDEATHBOTTOM) && (!(alignedTile & TileFlag.DEATHONBOTTOM) || p.invincible)) {
                p.y = ((ty << 5) + TILESIZE) + 0.2;
                p.oldy = p.y - 1;
                if (p.vely < 0) {
                    p.vely = -p.vely * BOUNCESTRENGTH;
                }
                return;
            }

            if (leftBlock && !leftBlock.isTransparent()) {
                // TODO: logic from 3965
            }
            if (rightBlock && !rightBlock.isTransparent()) {
                // TODO: logic from 3978
            }

            var unalignedTile = map.tile(unalignedBlockX, ty);
            if ((unalignedTile & TileFlag.SOLID) && !(unalignedTile & TileFlag.SUPERORPLAYERDEATHBOTTOM) && (!(unalignedTile & TileFlag.DEATHONBOTTOM) || p.invincible)) {
                p.x = unalignedBlockFX;
                p.oldx = p.y;
                p.y = py;
                p.vely += GRAVITATION;
            } else if ((alignedTile & TileFlag.PLAYERORDEATHONBOTTOM) || (unalignedTile & TileFlag.PLAYERORDEATHONBOTTOM)) {
                var respawnPlayer =
                    ((alignedTile & TileFlag.DEATHONTOP) && (unalignedTile & TileFlag.DEATHONTOP)) ||
                    ((alignedTile & TileFlag.DEATHONTOP) && !(unalignedTile & TileFlag.SOLID)) ||
                    (!(alignedTile & TileFlag.SOLID) && (unalignedTile & TileFlag.DEATHONTOP));
                //if(player_kill_nonkill != KillPlayerMapHazard(fRespawnPlayer, kill_style_environment, false))
                if (mapKilledPlayer(p)) {
                    return;
                }
            } else {
                p.y = py;
                p.vely += GRAVITATION;
            }

            p.isInAir = true;
            p.isOnIce = false;
        } else {
            // Moving down/on ground
            ty = Math.floor((py + PH) / TILESIZE);

            var leftBlock = map.block(txl, ty);
            var rightBlock = map.block(txr, ty);

            var leftBlockSolid = false; // leftBlock && !leftBlock.isTransparent() && !leftBlock.isHidden();
            var rightBlockSolid = false; // rightBlock && !rightBlock.isTransparent() && !rightBlock.isHidden();

            if (leftBlockSolid || rightBlockSolid) {
                // TODO: logic from 4051
            }

            var leftTile = map.tile(txl, ty);
            var rightTile = map.tile(txr, ty);

            var gapSupport = ((p.velx >= VELTURBOMOVING) || (p.velx <= -VELTURBOMOVING)) && ((leftTile == TileFlag.GAP) || (rightTile == TileFlag.GAP));
            var solidTileUnderPlayer = (leftTile & TileFlag.SOLID) || (rightTile & TileFlag.SOLID);

            if ((gapSupport || (leftTile & TileFlag.SOLIDONTOP) || (rightTile & TileFlag.SOLIDONTOP)) && (p.oldy + PH <= (ty << 5))) {
                // On ground
                p.isOnIce = false;

                if (p.fallThrough && !solidTileUnderPlayer) {
                    p.y = ((ty << 5) - PH) + 0.2;
                    p.isInAir = true;
                } else {
                    // We were above the tile in the previous frame
                    p.y = ((ty << 5) - PH) - 0.2;
                    p.vely = GRAVITATION;

                    var alignedTile = map.tile(alignedBlockX, ty);
                    if ((alignedTile & TileFlag.ICE) || (((alignedTile == TileFlag.NONSOLID) || (alignedTile == TileFlag.GAP)) && map.tile(unalignedBlockX, ty) & TileFlag.ICE)) {
                        p.isOnIce = true;
                    } else {
                        p.isOnIce = false;
                    }
                    p.isInAir = false;
                }

                p.oldy = p.y - GRAVITATION;
                p.fallThrough = false;
                return;
            }

            var deathTileUnder =
                    ((leftTile & TileFlag.DEATHONTOP) && (rightTile & TileFlag.DEATHONTOP)) ||
                    ((leftTile & TileFlag.DEATHONTOP) && !(rightTile & TileFlag.SOLID)) ||
                    (!(leftTile & TileFlag.SOLID) && (rightTile & TileFlag.DEATHONTOP));
            var superDeathTileUnder =
                    ((leftTile & TileFlag.SUPERORPLAYERDEATHTOP) && (rightTile & TileFlag.SUPERORPLAYERDEATHTOP)) ||
                    ((leftTile & TileFlag.SUPERORPLAYERDEATHTOP) && !(rightTile & TileFlag.SOLID)) ||
                    (!(leftTile & TileFlag.SOLID) && (rightTile & TileFlag.SUPERORPLAYERDEATHTOP));

            if (solidTileUnderPlayer && !superDeathTileUnder && (!deathTileUnder || p.invincible)) {
                // On ground
                p.y = ((ty << 5) - PH) - 0.2;
                p.vely = GRAVITATION;

                var alignedTile = map.tile(alignedBlockX, ty);
                if ((alignedTile & TileFlag.ICE) || (((alignedTile == TileFlag.NONSOLID) || (alignedTile == TileFlag.GAP)) && map.tile(unalignedBlockX, ty) & TileFlag.ICE)) {
                    p.isOnIce = true;
                } else {
                    p.isOnIce = false;
                }
                p.isInAir = false;
            } else if (deathTileUnder || superDeathTileUnder) {
                //if(player_kill_nonkill != KillPlayerMapHazard(fSuperDeathTileUnderPlayer, kill_style_environment, false))
                if (mapKilledPlayer(p)) {
                    return;
                }
            } else {
                // Falling in air
                p.y = py;
                p.vely = capFallingVelocity(GRAVITATION + p.vely);
                p.isInAir = true;
            }
        }

        this.fallThrough = false;
        if (this.isInAir) {
            this.isOnIce = false;
        }
    };

    function collision_detection_checktop(p) {
        var map = p.map;
        if (p.y < 0) {
            return false;
        }
        var ty = Math.floor(p.y / TILESIZE);
        if ((ty < 0) || (ty >= MAPHEIGHT)) {
            return false;
        }
        var txl = Math.floor(p.x / TILESIZE);
        if ((txl < 0) || (txl >= MAPWIDTH)) {
            return false;
        }
        var txr = -1;
        if (p.x + PW >= 640) {
            txr = Math.floor((ix + PW - 640) / TILESIZE);
        } else {
            txr = Math.floor((ix + PW) / TILESIZE);
        }
        if ((txr < 0) || (txr > MAPWIDTH)) {
            return false;
        }

        var leftTile = map.tile(txl, ty);
        var rightTile = map.tile(txr, ty);
        var leftBlock = map.block(txl, ty);
        var rightBlock = map.block(txr, ty);

        if ((leftTile & TileFlag.SOLID) || (rightTile & TileFlag.SOLID) ||
            (leftBlock && !leftBlock.isTransparent() && !leftBlock.isHidden()) ||
            (rightBlock && !rightBlock.isTransparent() && !rightBlock.isHidden())) {
            p.y = ((ty << 5) + TILESIZE) + 0.2;
            return true;
        } else {
            return false;
        }
    };

    function collision_detection_checkleft(p) {
        var map = p.map;
        if (p.y < 0) {
            return false;
        }
        var ty = Math.floor(p.y / TILESIZE);
        if ((ty < 0) || (ty >= MAPHEIGHT)) {
            return false;
        }
        var ty2 = Math.floor((p.y + PH) / TILESIZE);
        if ((ty2 < 0) || (ty2 >= MAPHEIGHT)) {
            return false;
        }
        var tx = Math.floor(p.x / TILESIZE);
        if ((tx < 0) || (tx >= MAPWIDTH)) {
            return false;
        }

        var topTile = map.tile(tx, ty);
        var bottomTile = map.tile(tx, ty2);
        var topBlock = map.block(tx, ty);
        var bottomBlock = map.block(tx, ty2);

        if ((topTile & TileFlag.SOLID) || (bottomTile & TileFlag.SOLID) ||
            (topBlock && !topBlock.isTransparent() && !topBlock.isHidden()) ||
            (bottomBlock && !bottomBlock.isTransparent() && !bottomBlock.isHidden())) {
            p.x = ((tx << 5) + TILESIZE) + 0.2;
            flipSidesIfNeeded(p);
            return true;
        } else {
            return false;
        }
    };

    function collision_detection_checkright(p) {
        var map = p.map;
        if (p.y < 0) {
            return false;
        }
        var ty = Math.floor(p.y / TILESIZE);
        if ((ty < 0) || (ty >= MAPHEIGHT)) {
            return false;
        }
        var ty2 = Math.floor((p.y + PH) / TILESIZE);
        if ((ty2 < 0) || (ty2 >= MAPHEIGHT)) {
            return false;
        }
        var tx = -1;
        if (p.x + PW >= 640) {
            tx = Math.floor((p.x + PW - 640) / TILESIZE);
        } else {
            tx = Math.floor((p.x + PW) / TILESIZE);
        }
        if ((tx < 0) || (tx >= MAPWIDTH)) {
            return false;
        }

        var topTile = map.tile(tx, ty);
        var bottomTile = map.tile(tx, ty2);
        var topBlock = map.block(tx, ty);
        var bottomBlock = map.block(tx, ty2);

        if ((topTile & TileFlag.SOLID) || (bottomTile & TileFlag.SOLID) ||
            (topBlock && !topBlock.isTransparent() && !topBlock.isHidden()) ||
            (bottomBlock && !bottomBlock.isTransparent() && !bottomBlock.isHidden())) {
            p.x = ((tx << 5) - PW) - 0.2;
            flipSidesIfNeeded(p);
            return true;
        } else {
            return false;
        }
    };

    function collision_detection_checksides(p) {
        // TODO: line 4349
    };

    Player.prototype.makeInvincible = function () {
        this.invincible = true;
        this.invincibleTimer = 0;
        this.animationState = 0;
        this.animationTimer = 0;

        //ifsoundonstop(sfx_invinciblemusic)
        //playinvinciblesound = true
    };

    Player.prototype.isFacingRight = function () {
        if (this.inputState.left && this.inputState.right && this.velx) {
            if (this.velx > 0) {
                return true;
            } else {
                return false;
            }
        } else {
            if (this.inputState.right) {
                return true;
            } else if (this.inputState.left) {
                return false;
            }
        }
        if (this.spr == PGFX_STOPPING_R) {
            return false;
        } else if (this.spr == PGFX_STOPPING_L) {
            return true;
        } else if (!(this.spr & 0x1)) {
            return true;
        } else {
            return false;
        }
    };

    Player.prototype.draw = function (ctx) {
        var sx = (this.spr * 32) + this.srcOffsetX;
        var sy = 0;
        var sw = 32;
        var sh = 32;
        var dx = Math.floor(this.x) - PWOFFSET;
        var dy = Math.floor(this.y) - PHOFFSET;
        var dw = 32;
        var dh = 32;
        ctx.drawImage(this.skin, sx, sy, sw, sh, dx, dy, dw, dh);
        //ctx.fillStyle = "rgb(255,0,0)";
        //ctx.fillRect(dx, dy, dw, dh);
    };

    Player.create = function (game, resourceManager, skinName, callback) {
        resourceManager.loadSkin(skinName, function (skin) {
            if (skin) {
                var player = new Player(game, skin);
                callback(player);
            } else {
                callback(null);
            }
        });
    };

    smw.Player = Player;

})();
