/* World: chunk storage, block access, edits, save/load. */
(function (global) {
  'use strict';
  var CH = 16, HEIGHT = 128;
  var Blocks = global.Blocks;

  function Chunk(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(CH * CH * HEIGHT);
    this.generated = false;
    this.dirty = true;      // needs remesh
    this.mesh = null;       // renderer-owned
    this.meshWater = null;
    this.empty = true;
  }
  Chunk.prototype.idx = function (x, y, z) { return (y * CH + z) * CH + x; };
  Chunk.prototype.get = function (x, y, z) { return this.blocks[(y * CH + z) * CH + x]; };
  Chunk.prototype.set = function (x, y, z, id) { this.blocks[(y * CH + z) * CH + x] = id; };

  function World(seed, gen) {
    this.seed = seed;
    this.gen = gen;
    this.chunks = new Map();
    this.edits = new Map();   // "x,y,z" -> id
    this.modified = new Set(); // chunk keys touched by edits
    this.onChunkReady = null;
  }
  World.CH = CH; World.HEIGHT = HEIGHT;

  World.prototype.key = function (cx, cz) { return cx + ',' + cz; };

  World.prototype.getChunk = function (cx, cz, create) {
    var k = this.key(cx, cz);
    var c = this.chunks.get(k);
    if (!c && create) { c = new Chunk(cx, cz); this.chunks.set(k, c); }
    return c;
  };

  World.prototype.generate = function (cx, cz) {
    var c = this.getChunk(cx, cz, true);
    if (c.generated) return c;
    var data = this.gen.generateChunk(cx, cz);
    c.blocks.set(data);
    c.generated = true;
    c.dirty = true;
    // apply saved edits for this chunk
    var ox = cx * CH, oz = cz * CH;
    if (this.edits.size) {
      this.edits.forEach(function (id, k) {
        var p = k.split(',');
        var x = +p[0], y = +p[1], z = +p[2];
        if (x >> 4 === cx && z >> 4 === cz) c.set(x - ox, y, z - oz, id);
      });
    }
    // neighbours meshed before this chunk existed drew faces against empty space:
    // remesh them so the seam closes (no floating trees / sliced terrain at edges)
    this.markDirty(cx - 1, cz);
    this.markDirty(cx + 1, cz);
    this.markDirty(cx, cz - 1);
    this.markDirty(cx, cz + 1);
    return c;
  };

  World.prototype.getBlock = function (x, y, z) {
    if (y < 0 || y >= HEIGHT) return 0;
    var cx = x >> 4, cz = z >> 4;
    var c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return -1; // unknown
    return c.blocks[(y * CH + (z & 15)) * CH + (x & 15)];
  };

  // For meshing: unknown neighbours are treated as solid (no faces at the edge).
  World.prototype.getBlockMesh = function (x, y, z) {
    if (y < 0) return 1;
    if (y >= HEIGHT) return 0;
    var cx = x >> 4, cz = z >> 4;
    var c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return 1;
    return c.blocks[(y * CH + (z & 15)) * CH + (x & 15)];
  };

  World.prototype.setBlock = function (x, y, z, id, record) {
    if (y < 0 || y >= HEIGHT) return false;
    var cx = x >> 4, cz = z >> 4;
    var c = this.getChunk(cx, cz, true);
    if (!c.generated) this.generate(cx, cz);
    var lx = x & 15, lz = z & 15;
    if (c.get(lx, y, lz) === id) return false;
    c.set(lx, y, lz, id);
    c.dirty = true;
    if (record !== false) {
      this.edits.set(x + ',' + y + ',' + z, id);
      this.modified.add(this.key(cx, cz));
    }
    // mark neighbour chunks dirty when on a border
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === 15) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === 15) this.markDirty(cx, cz + 1);
    return true;
  };

  World.prototype.markDirty = function (cx, cz) {
    var c = this.chunks.get(this.key(cx, cz));
    if (c && c.generated) c.dirty = true;
  };

  World.prototype.heightAt = function (x, z) {
    var cx = x >> 4, cz = z >> 4;
    var c = this.chunks.get(this.key(cx, cz));
    if (!c || !c.generated) return this.gen.columnHeight(x, z);
    var lx = x & 15, lz = z & 15;
    for (var y = HEIGHT - 1; y >= 0; y--) {
      var id = c.blocks[(y * CH + lz) * CH + lx];
      if (id !== 0 && id !== 9 && id !== 32 && id !== 33 && id !== 34 && id !== 44 && id !== 45) return y;
    }
    return 0;
  };

  // ---- persistence ----
  World.prototype.serialize = function () {
    var e = [];
    this.edits.forEach(function (id, k) { e.push(k + ':' + id); });
    return { seed: this.seed, edits: e.join(';') };
  };

  World.prototype.loadEdits = function (str) {
    if (!str) return;
    var self = this;
    str.split(';').forEach(function (s) {
      if (!s) return;
      var p = s.split(':');
      if (p.length !== 2) return;
      self.edits.set(p[0], +p[1]);
    });
  };

  global.World = World;
})(window);
