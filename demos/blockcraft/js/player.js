/* Player: physics, collision, raycast, block interaction. */
(function (global) {
  'use strict';
  var Blocks = global.Blocks;

  var W = 0.6, H = 1.8, EYE = 1.62;

  function Player(world) {
    this.world = world;
    this.pos = [0, 80, 0];
    this.vel = [0, 0, 0];
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.sneaking = false;
    this.sprinting = false;
    this.inWater = false;
    this.headInWater = false;
    this.bob = 0;
    this.walkDist = 0;
    this.fov = 75;
    this.lastSpace = 0;
    this.health = 20;
    this.fallStart = null;
  }
  Player.W = W; Player.H = H; Player.EYE = EYE;

  Player.prototype.eye = function () {
    var sneak = this.sneaking && !this.flying ? 0.18 : 0;
    return [this.pos[0], this.pos[1] + EYE - sneak, this.pos[2]];
  };

  Player.prototype.solidAt = function (x, y, z) {
    var id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    if (id <= 0) return false;
    var b = Blocks.list[id];
    return !!(b && b.solid);
  };

  Player.prototype.collides = function (px, py, pz) {
    var x0 = Math.floor(px - W / 2), x1 = Math.floor(px + W / 2 - 1e-6);
    var y0 = Math.floor(py), y1 = Math.floor(py + H - 1e-6);
    var z0 = Math.floor(pz - W / 2), z1 = Math.floor(pz + W / 2 - 1e-6);
    for (var y = y0; y <= y1; y++)
      for (var z = z0; z <= z1; z++)
        for (var x = x0; x <= x1; x++)
          if (this.solidAt(x + 0.5, y + 0.5, z + 0.5)) return true;
    return false;
  };

  Player.prototype.moveAxis = function (axis, amount) {
    if (amount === 0) return false;
    var p = this.pos.slice();
    p[axis] += amount;
    if (!this.collides(p[0], p[1], p[2])) { this.pos = p; return false; }
    // step up (only when moving horizontally and on ground)
    if (axis !== 1 && this.onGround) {
      var q = this.pos.slice();
      q[axis] += amount; q[1] += 1.01;
      if (!this.collides(q[0], q[1], q[2])) {
        // check there is room at the raised position
        this.pos = q;
        return false;
      }
    }
    // slide to the edge of the block
    var step = amount > 0 ? 0.01 : -0.01;
    var moved = 0;
    while (Math.abs(moved) < Math.abs(amount)) {
      var t = this.pos.slice();
      t[axis] += step;
      if (this.collides(t[0], t[1], t[2])) break;
      this.pos = t;
      moved += step;
    }
    return true;
  };

  Player.prototype.update = function (dt, input) {
    var world = this.world;
    var feet = world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] + 0.2), Math.floor(this.pos[2]));
    var head = world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] + EYE), Math.floor(this.pos[2]));
    this.inWater = feet === 9;
    this.headInWater = head === 9;

    var speed = this.flying ? 11 : (this.sprinting ? 6.2 : (this.sneaking ? 1.5 : 4.4));
    if (this.inWater && !this.flying) speed *= 0.6;
    var fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    var str = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    var len = Math.hypot(fwd, str);
    if (len > 0) { fwd /= len; str /= len; }
    var sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    // forward direction for yaw: (-sin, -cos)
    var wx = (-sinY * fwd + cosY * str) * speed;
    var wz = (-cosY * fwd - sinY * str) * speed;

    if (this.flying) {
      var accel = 10;
      this.vel[0] += (wx - this.vel[0]) * Math.min(1, accel * dt);
      this.vel[2] += (wz - this.vel[2]) * Math.min(1, accel * dt);
      var vy = 0;
      if (input.jump) vy += speed * 0.8;
      if (input.sneak) vy -= speed * 0.8;
      this.vel[1] += (vy - this.vel[1]) * Math.min(1, accel * dt);
    } else {
      var accelG = this.onGround ? 14 : 4;
      this.vel[0] += (wx - this.vel[0]) * Math.min(1, accelG * dt);
      this.vel[2] += (wz - this.vel[2]) * Math.min(1, accelG * dt);
      if (this.inWater) {
        this.vel[1] -= 9 * dt;
        this.vel[1] = Math.max(this.vel[1], -3);
        if (input.jump) this.vel[1] = 3.2;
      } else {
        this.vel[1] -= 28 * dt;
        if (this.vel[1] < -50) this.vel[1] = -50;
        if (input.jump && this.onGround) {
          this.vel[1] = 8.6;
          this.onGround = false;
          if (global.Sound) global.Sound.jump();
        }
      }
    }

    var wasGround = this.onGround;
    var vyBefore = this.vel[1];
    var hitY = this.moveAxis(1, this.vel[1] * dt);
    if (hitY) {
      if (this.vel[1] < 0) {
        this.onGround = true;
        if (!wasGround && vyBefore < -12 && global.Sound) global.Sound.land();
      }
      this.vel[1] = 0;
    } else {
      this.onGround = false;
    }
    this.moveAxis(0, this.vel[0] * dt);
    this.moveAxis(2, this.vel[2] * dt);

    // ground check when standing still
    if (!this.onGround && !this.flying) {
      var below = this.pos.slice(); below[1] -= 0.02;
      if (this.collides(below[0], below[1], below[2])) this.onGround = true;
    }

    // walking animation distance
    var hs = Math.hypot(this.vel[0], this.vel[2]);
    if (this.onGround && hs > 0.5) {
      this.walkDist += hs * dt;
      this.bob = Math.sin(this.walkDist * 2.2) * 0.045 * Math.min(1, hs / 4);
    } else {
      this.bob *= Math.max(0, 1 - dt * 8);
    }
    if (this.pos[1] < -20) { this.pos[1] = 100; this.vel = [0, 0, 0]; }
  };

  // Voxel raycast (Amanatides & Woo). Returns {x,y,z, nx,ny,nz, id, dist} or null.
  Player.prototype.raycast = function (maxDist) {
    var eye = this.eye();
    var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    var dir = [-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp];
    var x = Math.floor(eye[0]), y = Math.floor(eye[1]), z = Math.floor(eye[2]);
    var stepX = dir[0] > 0 ? 1 : -1, stepY = dir[1] > 0 ? 1 : -1, stepZ = dir[2] > 0 ? 1 : -1;
    var tDeltaX = Math.abs(1 / dir[0]), tDeltaY = Math.abs(1 / dir[1]), tDeltaZ = Math.abs(1 / dir[2]);
    var tMaxX = dir[0] === 0 ? Infinity : ((dir[0] > 0 ? x + 1 - eye[0] : eye[0] - x) / Math.abs(dir[0]));
    var tMaxY = dir[1] === 0 ? Infinity : ((dir[1] > 0 ? y + 1 - eye[1] : eye[1] - y) / Math.abs(dir[1]));
    var tMaxZ = dir[2] === 0 ? Infinity : ((dir[2] > 0 ? z + 1 - eye[2] : eye[2] - z) / Math.abs(dir[2]));
    var nx = 0, ny = 0, nz = 0, t = 0;
    for (var i = 0; i < 200; i++) {
      var id = this.world.getBlock(x, y, z);
      if (id > 0 && id !== 9 && id !== 46 && id !== 95) {
        return { x: x, y: y, z: z, nx: nx, ny: ny, nz: nz, id: id, dist: t };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
      if (t > maxDist) break;
    }
    return null;
  };

  Player.prototype.intersectsBlock = function (bx, by, bz) {
    var p = this.pos;
    return (p[0] + W / 2 > bx && p[0] - W / 2 < bx + 1 &&
            p[1] + H > by && p[1] < by + 1 &&
            p[2] + W / 2 > bz && p[2] - W / 2 < bz + 1);
  };

  global.Player = Player;
})(window);
