/*
 * worldgen.js — deterministic, dependency-free voxel world generator.
 *   const gen = WorldGen.create(seed);
 *   gen.generateChunk(cx, cz) -> Uint8Array(16*128*16), index (y*16+z)*16+x
 *   gen.columnHeight(x, z), gen.biomeAt(x, z), gen.treesInChunk(cx, cz)
 */
(function (global) {
  'use strict';

  var B = {
    AIR: 0, STONE: 1, GRASS: 2, DIRT: 3, COBBLESTONE: 4, PLANKS: 5, SAND: 6, LOG: 7,
    LEAVES: 8, WATER: 9, GLASS: 10, BEDROCK: 11, SNOW: 12, COAL_ORE: 13, IRON_ORE: 14,
    GOLD_ORE: 15, DIAMOND_ORE: 16, BRICK: 17, CRAFTING_TABLE: 18, TORCH: 19, GLOWSTONE: 20,
    OBSIDIAN: 21, SANDSTONE: 22, GRAVEL: 23, ICE: 24, CLAY: 25, MOSSY_STONE: 26,
    BIRCH_LOG: 27, SPRUCE_LOG: 28, BIRCH_LEAVES: 29, SPRUCE_LEAVES: 30, CACTUS: 31,
    TALL_GRASS: 32, FLOWER_RED: 33, FLOWER_YELLOW: 34, PUMPKIN: 35, LAPIS_ORE: 36,
    REDSTONE_ORE: 37, EMERALD_ORE: 38, DEAD_BUSH: 44, SUGAR_CANE: 45
  };

  var SEA_LEVEL = 62;
  var CHUNK = 16;
  var HEIGHT = 128;

  function hash2(x, z, seed) {
    var h = seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function hash3(x, y, z, seed) {
    var h = seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(y | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function seedFrom(value) {
    if (typeof value === 'number' && isFinite(value)) return (value | 0) ^ 0x5bd1e995;
    var s = String(value == null ? 0 : value);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h | 0;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function valueNoise(x, z, period, seed) {
    var fx = x / period, fz = z / period;
    var ix = Math.floor(fx), iz = Math.floor(fz);
    var tx = smooth(fx - ix), tz = smooth(fz - iz);
    var a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
    var c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
    var top = a + (b - a) * tx, bot = c + (d - c) * tx;
    return top + (bot - top) * tz;
  }
  function fbm(x, z, period, octaves, seed) {
    var sum = 0, amp = 1, norm = 0, p = period;
    for (var o = 0; o < octaves; o++) {
      sum += valueNoise(x, z, p, seed + o * 1013) * amp;
      norm += amp; amp *= 0.5; p *= 0.5;
    }
    return sum / norm;
  }

  function create(seedValue) {
    var seed = seedFrom(seedValue);
    var heightCache = new Map();

    function rawHeight(x, z) {
      var cont = fbm(x, z, 220, 4, seed + 11);
      var hills = fbm(x, z, 64, 4, seed + 23);
      var detail = fbm(x, z, 18, 3, seed + 37);
      var mask = fbm(x, z, 340, 3, seed + 53);
      var mountain = Math.max(0, mask - 0.55) * 2.2;
      var base = 58 + (cont - 0.5) * 46;
      var h = base + (hills - 0.5) * 22 + (detail - 0.5) * 6;
      h += mountain * (hills * 70 + 20);
      if (h < 8) h = 8;
      if (h > 112) h = 112;
      return h;
    }
    function heightAt(x, z) {
      var key = (x & 0xffff) * 65536 + (z & 0xffff);
      var c = heightCache.get(key);
      if (c !== undefined) return c;
      var h = Math.floor(rawHeight(x, z));
      if (heightCache.size > 200000) heightCache.clear();
      heightCache.set(key, h);
      return h;
    }
    function biomeAt(x, z) {
      var h = heightAt(x, z);
      var t = fbm(x, z, 300, 3, seed + 71);
      var m = fbm(x, z, 260, 3, seed + 89);
      if (h < SEA_LEVEL - 1) return 'ocean';
      if (h <= SEA_LEVEL + 1) return 'beach';
      if (h > 96) return t < 0.45 ? 'snow' : 'mountains';
      if (t > 0.62 && m < 0.45) return 'desert';
      if (t < 0.3) return 'snow';
      if (m > 0.55) return 'forest';
      return 'plains';
    }
    function isCave(x, y, z) {
      if (y < 4) return false;
      var n1 = valueNoise(x + y * 0.7, z - y * 0.5, 26, seed + 131);
      var n2 = valueNoise(x - y * 0.4, z + y * 0.8, 26, seed + 149);
      var r1 = Math.abs(n1 - 0.5), r2 = Math.abs(n2 - 0.5);
      var depthFactor = Math.min(1, (y - 4) / 20);
      return r1 < 0.035 * depthFactor && r2 < 0.035 * depthFactor;
    }

    // tree at a column (or null)
    function treeAt(x, z) {
      var h = heightAt(x, z);
      var b = biomeAt(x, z);
      if (h <= SEA_LEVEL || b === 'ocean' || b === 'beach' || b === 'desert') return null;
      var r = hash2(x, z, seed + 211);
      var density = b === 'forest' ? 0.035 : (b === 'plains' ? 0.006 : 0.012);
      if (r > density) return null;
      for (var dx = -2; dx <= 2; dx++) {
        for (var dz = -2; dz <= 2; dz++) {
          if (dx === 0 && dz === 0) continue;
          if (hash2(x + dx, z + dz, seed + 211) < r) return null;
        }
      }
      var type = 'oak';
      if (b === 'snow' || b === 'mountains') type = 'spruce';
      else if (hash2(x, z, seed + 229) < 0.3) type = 'birch';
      return { x: x, z: z, y: h + 1, type: type, height: 4 + Math.floor(hash2(x, z, seed + 223) * 3) };
    }

    function treesInChunk(cx, cz) {
      var out = [];
      for (var z = 0; z < 16; z++) for (var x = 0; x < 16; x++) {
        var t = treeAt(cx * 16 + x, cz * 16 + z);
        if (t) out.push(t);
      }
      return out;
    }

    function generateChunk(cx, cz) {
      var arr = new Uint8Array(16 * 16 * HEIGHT);
      var ox = cx * 16, oz = cz * 16;
      var x, z, y, h, b, i;
      for (z = 0; z < 16; z++) {
        for (x = 0; x < 16; x++) {
          var wx = ox + x, wz = oz + z;
          h = heightAt(wx, wz);
          b = biomeAt(wx, wz);
          var col = x + z * 16;
          var topBlock, filler, fillerDepth;
          if (b === 'ocean' || b === 'beach' || b === 'desert') {
            topBlock = B.SAND; filler = b === 'desert' ? B.SANDSTONE : B.SAND; fillerDepth = 3;
          } else if (b === 'snow') {
            topBlock = B.SNOW; filler = B.DIRT; fillerDepth = 3;
          } else if (b === 'mountains') {
            topBlock = h > 100 ? B.STONE : B.GRASS; filler = B.DIRT; fillerDepth = 2;
          } else {
            topBlock = B.GRASS; filler = B.DIRT; fillerDepth = 3;
          }
          for (y = 0; y <= h; y++) {
            var id;
            if (y === 0) id = B.BEDROCK;
            else if (y === h) id = topBlock;
            else if (y > h - fillerDepth) id = filler;
            else id = B.STONE;
            if (id === B.STONE && y > 1 && isCave(wx, y, wz)) id = B.AIR;
            arr[(y * 16 + z) * 16 + x] = id;
          }
          if (h < SEA_LEVEL) {
            for (y = h + 1; y <= SEA_LEVEL; y++) arr[(y * 16 + z) * 16 + x] = B.WATER;
            if (b === 'snow') arr[(SEA_LEVEL * 16 + z) * 16 + x] = B.ICE;
            if (hash2(wx, wz, seed + 307) < 0.08) arr[(h * 16 + z) * 16 + x] = B.GRAVEL;
            else if (hash2(wx, wz, seed + 311) < 0.04) arr[(h * 16 + z) * 16 + x] = B.CLAY;
          }
        }
      }
      // ores
      for (i = 0; i < 48; i++) {
        var rx = Math.floor(hash3(cx, i, cz, seed + 401) * 16);
        var rz = Math.floor(hash3(cx, i, cz, seed + 409) * 16);
        var ry = 2 + Math.floor(hash3(cx, i, cz, seed + 419) * 60);
        var kind = hash3(cx, i, cz, seed + 431);
        var ore = kind < 0.5 ? B.COAL_ORE : (kind < 0.8 ? B.IRON_ORE : (ry < 30 ? B.GOLD_ORE : B.COAL_ORE));
        if (ry < 16 && kind > 0.96) ore = B.DIAMOND_ORE;
        else if (ry < 24 && kind > 0.93) ore = B.REDSTONE_ORE;
        else if (ry < 30 && kind > 0.90) ore = B.LAPIS_ORE;
        else if (ry > 60 && kind > 0.985) ore = B.EMERALD_ORE;
        var size = 2 + Math.floor(hash3(cx, i, cz, seed + 443) * 4);
        for (var k = 0; k < size; k++) {
          var px = rx + Math.floor(hash3(cx, i * 31 + k, cz, seed + 457) * 3) - 1;
          var pz = rz + Math.floor(hash3(cx, i * 37 + k, cz, seed + 461) * 3) - 1;
          var py = ry + Math.floor(hash3(cx, i * 41 + k, cz, seed + 467) * 3) - 1;
          if (px < 0 || px > 15 || pz < 0 || pz > 15 || py < 1 || py >= HEIGHT) continue;
          var idx = (py * 16 + pz) * 16 + px;
          if (arr[idx] === B.STONE) arr[idx] = ore;
        }
      }
      // plants
      for (z = 0; z < 16; z++) {
        for (x = 0; x < 16; x++) {
          var wx2 = ox + x, wz2 = oz + z;
          var hh = heightAt(wx2, wz2);
          if (hh < SEA_LEVEL || hh + 1 >= HEIGHT) continue;
          var bb = biomeAt(wx2, wz2);
          var ground = arr[(hh * 16 + z) * 16 + x];
          if (arr[((hh + 1) * 16 + z) * 16 + x] !== B.AIR) continue;
          var r2 = hash2(wx2, wz2, seed + 509);
          if (bb === 'desert') {
            if (ground === B.SAND && r2 < 0.012) {
              var ch = 1 + Math.floor(hash2(wx2, wz2, seed + 521) * 3);
              for (var cy = 1; cy <= ch; cy++) arr[((hh + cy) * 16 + z) * 16 + x] = B.CACTUS;
            } else if (ground === B.SAND && r2 < 0.03) arr[((hh + 1) * 16 + z) * 16 + x] = B.DEAD_BUSH;
          } else if (ground === B.GRASS || ground === B.SNOW) {
            if (r2 < 0.10) arr[((hh + 1) * 16 + z) * 16 + x] = B.TALL_GRASS;
            else if (r2 < 0.115) arr[((hh + 1) * 16 + z) * 16 + x] = (r2 < 0.1075 ? B.FLOWER_RED : B.FLOWER_YELLOW);
            else if (r2 < 0.117) arr[((hh + 1) * 16 + z) * 16 + x] = B.PUMPKIN;
          }
        }
      }
      // trees from the 3x3 neighbourhood
      for (var ncz = cz - 1; ncz <= cz + 1; ncz++) {
        for (var ncx = cx - 1; ncx <= cx + 1; ncx++) {
          var trees = treesInChunk(ncx, ncz);
          for (var ti = 0; ti < trees.length; ti++) {
            var t = trees[ti];
            var lx = t.x - ox, lz = t.z - oz;
            var log = t.type === 'birch' ? B.BIRCH_LOG : (t.type === 'spruce' ? B.SPRUCE_LOG : B.LOG);
            var leaf = t.type === 'birch' ? B.BIRCH_LEAVES : (t.type === 'spruce' ? B.SPRUCE_LEAVES : B.LEAVES);
            var th = t.height;
            for (var ly = 0; ly < th; ly++) {
              var lxx = lx, lzz = lz, lyy = t.y + ly;
              if (lxx < 0 || lxx > 15 || lzz < 0 || lzz > 15 || lyy >= HEIGHT) continue;
              var li = (lyy * 16 + lzz) * 16 + lxx;
              if (arr[li] === B.AIR || arr[li] === B.TALL_GRASS || arr[li] === B.FLOWER_RED || arr[li] === B.FLOWER_YELLOW) arr[li] = log;
            }
            for (var dy = -2; dy <= 1; dy++) {
              var yy = t.y + th - 1 + dy;
              var rad = dy <= -1 ? 2 : 1;
              for (var ddx = -rad; ddx <= rad; ddx++) {
                for (var ddz = -rad; ddz <= rad; ddz++) {
                  if (Math.abs(ddx) === rad && Math.abs(ddz) === rad && dy === 1) continue;
                  if (ddx === 0 && ddz === 0 && dy < 1) continue;
                  var ax = lx + ddx, az = lz + ddz;
                  if (ax < 0 || ax > 15 || az < 0 || az > 15 || yy < 0 || yy >= HEIGHT) continue;
                  var ai = (yy * 16 + az) * 16 + ax;
                  if (arr[ai] === B.AIR) arr[ai] = leaf;
                }
              }
            }
          }
        }
      }
      return arr;
    }

    return {
      seed: seed,
      generateChunk: generateChunk,
      columnHeight: function (x, z) { return heightAt(Math.floor(x), Math.floor(z)); },
      biomeAt: function (x, z) { return biomeAt(Math.floor(x), Math.floor(z)); },
      treesInChunk: treesInChunk
    };
  }

  global.WorldGen = {
    create: create, CHUNK: CHUNK, HEIGHT: HEIGHT, SEA_LEVEL: SEA_LEVEL, B: B
  };
})(typeof window !== 'undefined' ? window : globalThis);
