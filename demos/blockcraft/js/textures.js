/*
 * js/textures.js — procedural Minecraft-style 16x16 pixel textures.
 * Self-contained: no images, no network, no dependencies.
 *
 * Public API (window.Textures):
 *   Textures.SIZE                      -> 16
 *   Textures.TILE                      -> 16 (pixels per tile in the atlas)
 *   Textures.get(name)                 -> HTMLCanvasElement (16x16) or null
 *   Textures.canvas(name)              -> alias of get()
 *   Textures.names()                   -> array of texture names
 *   Textures.has(name)                 -> boolean
 *   Textures.dataURL(name)             -> data: URL of the 16x16 canvas
 *   Textures.atlas()                   -> { canvas, tile, cols, rows, index: {name: tileIndex} }
 *   Textures.uv(name)                  -> { u0, v0, u1, v1 } in the atlas (0..1)
 *   Textures.breakStage(stage)         -> HTMLCanvasElement (16x16) crack overlay, stage 0..9
 *   Textures.breakStages()             -> 10 crack canvases (index 0 = lightest)
 *   Textures.avgColor(name)            -> [r, g, b] average colour of a texture
 *   Textures.blocks                    -> { blockName: { top, side, bottom } } texture names
 *   Textures.blockFaces(blockName)     -> { top, side, bottom } texture names (fallback to name)
 *
 * Texture names (all 16x16):
 *   grass_top, grass_side, dirt, stone, cobblestone, sand, gravel, bedrock,
 *   log_side, log_top, planks, leaves, water, glass, snow, coal_ore, iron_ore,
 *   gold_ore, diamond_ore, sandstone, brick, crafting_table_top, crafting_table_side,
 *   tnt_side, tnt_top, tnt_bottom, glowstone, obsidian, wool_white, wool_red,
 *   wool_blue, wool_green, wool_yellow, wool_black
 */
(function (global) {
  'use strict';

  var SIZE = 16;
  var TILE = 16;

  // ---------------------------------------------------------------- helpers
  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

  function rgb(r, g, b) {
    return 'rgb(' + clamp255(r) + ',' + clamp255(g) + ',' + clamp255(b) + ')';
  }

  // Deterministic PRNG (mulberry32) so textures look the same every load.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function makeCanvas() {
    var c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    return c;
  }

  function ctxOf(c) {
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  // Paint a single pixel.
  function px(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  }

  // Fill the whole tile with a base colour then add per-pixel noise.
  // base: [r,g,b]; amount: max +/- variation; rand: PRNG.
  function noisyFill(ctx, base, amount, rand, opts) {
    opts = opts || {};
    var dark = opts.dark || 0;
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        var n = (rand() * 2 - 1) * amount;
        var r = base[0] + n;
        var g = base[1] + n;
        var b = base[2] + n;
        if (dark && rand() < dark) {
          var d = 10 + rand() * 20;
          r -= d; g -= d; b -= d;
        }
        px(ctx, x, y, rgb(r, g, b));
      }
    }
  }

  // Scatter random darker/lighter specks.
  function speckle(ctx, rand, count, colors) {
    for (var i = 0; i < count; i++) {
      var x = (rand() * SIZE) | 0;
      var y = (rand() * SIZE) | 0;
      px(ctx, x, y, colors[(rand() * colors.length) | 0]);
    }
  }

  // ---------------------------------------------------------------- textures
  var builders = {};

  builders.grass_top = function (ctx, rand) {
    noisyFill(ctx, [96, 158, 62], 26, rand);
    speckle(ctx, rand, 40, ['rgb(74,132,46)', 'rgb(118,180,78)', 'rgb(88,146,54)']);
  };

  builders.dirt = function (ctx, rand) {
    noisyFill(ctx, [134, 96, 67], 22, rand, { dark: 0.12 });
    speckle(ctx, rand, 26, ['rgb(104,72,48)', 'rgb(156,116,84)', 'rgb(120,84,58)']);
  };

  builders.grass_side = function (ctx, rand) {
    // dirt base
    builders.dirt(ctx, rand);
    // grass overhang along the top with a ragged edge
    for (var x = 0; x < SIZE; x++) {
      var depth = 3 + ((rand() * 3) | 0);
      for (var y = 0; y < depth; y++) {
        var n = (rand() * 2 - 1) * 22;
        px(ctx, x, y, rgb(96 + n, 158 + n, 62 + n));
      }
      // a few hanging blades
      if (rand() < 0.35) {
        px(ctx, x, depth, rgb(80, 136, 50));
      }
    }
  };

  builders.stone = function (ctx, rand) {
    noisyFill(ctx, [128, 128, 128], 16, rand, { dark: 0.08 });
    speckle(ctx, rand, 30, ['rgb(108,108,108)', 'rgb(146,146,146)', 'rgb(118,118,118)']);
  };

  builders.cobblestone = function (ctx, rand) {
    // mortar background
    noisyFill(ctx, [86, 86, 86], 8, rand);
    // irregular stones
    var stones = [
      [0, 0, 6, 5], [7, 0, 5, 4], [13, 0, 3, 6],
      [0, 6, 4, 4], [5, 5, 6, 6], [12, 5, 4, 5],
      [0, 11, 7, 5], [8, 12, 4, 4], [13, 11, 3, 5],
      [8, 9, 3, 2]
    ];
    for (var i = 0; i < stones.length; i++) {
      var s = stones[i];
      var base = 118 + ((rand() * 40) | 0);
      for (var y = s[1]; y < s[1] + s[3] && y < SIZE; y++) {
        for (var x = s[0]; x < s[0] + s[2] && x < SIZE; x++) {
          var n = (rand() * 2 - 1) * 14;
          var edge = (x === s[0] || y === s[1]) ? 14 : 0;
          px(ctx, x, y, rgb(base + n + edge, base + n + edge, base + n + edge));
        }
      }
    }
  };

  builders.sand = function (ctx, rand) {
    noisyFill(ctx, [219, 207, 160], 14, rand);
    speckle(ctx, rand, 24, ['rgb(200,186,138)', 'rgb(232,222,180)']);
  };

  builders.gravel = function (ctx, rand) {
    noisyFill(ctx, [130, 124, 120], 18, rand);
    speckle(ctx, rand, 70, ['rgb(96,92,90)', 'rgb(160,154,148)', 'rgb(112,106,102)', 'rgb(146,140,134)']);
  };

  builders.bedrock = function (ctx, rand) {
    noisyFill(ctx, [60, 60, 60], 26, rand, { dark: 0.25 });
    speckle(ctx, rand, 40, ['rgb(30,30,30)', 'rgb(96,96,96)', 'rgb(48,48,48)']);
  };

  builders.log_side = function (ctx, rand) {
    // bark: vertical streaks
    for (var x = 0; x < SIZE; x++) {
      var col = 96 + ((rand() * 30) | 0);
      for (var y = 0; y < SIZE; y++) {
        var n = (rand() * 2 - 1) * 12;
        var v = col + n;
        if (rand() < 0.12) v -= 22;
        px(ctx, x, y, rgb(v, v * 0.72, v * 0.42));
      }
    }
  };

  builders.log_top = function (ctx, rand) {
    // rings
    var cx = 7.5, cy = 7.5;
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        var d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
        var ring = Math.floor(d) % 2 === 0;
        var n = (rand() * 2 - 1) * 10;
        var base = ring ? 176 : 150;
        px(ctx, x, y, rgb(base + n, base * 0.78 + n, base * 0.46 + n));
      }
    }
    // bark border
    for (var i = 0; i < SIZE; i++) {
      px(ctx, i, 0, 'rgb(96,70,40)');
      px(ctx, i, SIZE - 1, 'rgb(96,70,40)');
      px(ctx, 0, i, 'rgb(96,70,40)');
      px(ctx, SIZE - 1, i, 'rgb(96,70,40)');
    }
  };

  builders.planks = function (ctx, rand) {
    var rows = [0, 4, 8, 12];
    for (var r = 0; r < rows.length; r++) {
      var y0 = rows[r];
      var base = 168 + ((rand() * 24) | 0);
      for (var y = y0; y < y0 + 4; y++) {
        for (var x = 0; x < SIZE; x++) {
          var n = (rand() * 2 - 1) * 10;
          var v = base + n;
          if (y === y0 + 3) v -= 34; // seam between planks
          px(ctx, x, y, rgb(v, v * 0.72, v * 0.42));
        }
      }
      // vertical nail seam, offset per row
      var sx = (r % 2 === 0) ? 5 : 11;
      for (var yy = y0; yy < y0 + 3; yy++) px(ctx, sx, yy, 'rgb(120,86,50)');
    }
  };

  builders.leaves = function (ctx, rand) {
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        var r = rand();
        var g = 120 + ((rand() * 50) | 0);
        if (r < 0.18) {
          // hole (dark, semi-transparent look)
          px(ctx, x, y, 'rgba(30,60,20,0.55)');
        } else {
          px(ctx, x, y, rgb(g * 0.45, g, g * 0.35));
        }
      }
    }
  };

  builders.water = function (ctx, rand) {
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        var wave = Math.sin((x + y * 0.5) * 0.9) * 10 + (rand() * 2 - 1) * 8;
        px(ctx, x, y, rgb(40 + wave, 90 + wave, 200 + wave * 0.6));
      }
    }
  };

  builders.glass = function (ctx, rand) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    // faint tint
    ctx.fillStyle = 'rgba(200,230,255,0.18)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    // frame
    ctx.fillStyle = 'rgba(220,240,255,0.85)';
    ctx.fillRect(0, 0, SIZE, 1);
    ctx.fillRect(0, SIZE - 1, SIZE, 1);
    ctx.fillRect(0, 0, 1, SIZE);
    ctx.fillRect(SIZE - 1, 0, 1, SIZE);
    // highlight streak
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (var i = 2; i < 6; i++) px(ctx, i, 7 - i + 2, 'rgba(255,255,255,0.55)');
    px(ctx, 3, 3, 'rgba(255,255,255,0.7)');
    px(ctx, 4, 3, 'rgba(255,255,255,0.4)');
    px(ctx, 3, 4, 'rgba(255,255,255,0.4)');
  };

  builders.snow = function (ctx, rand) {
    noisyFill(ctx, [240, 246, 250], 8, rand);
    speckle(ctx, rand, 16, ['rgb(224,232,240)', 'rgb(252,254,255)']);
  };

  function ore(name, color, seedOffset) {
    builders[name] = function (ctx, rand) {
      builders.stone(ctx, rand);
      var spots = 5 + ((rand() * 3) | 0);
      for (var i = 0; i < spots; i++) {
        var x = 1 + ((rand() * 13) | 0);
        var y = 1 + ((rand() * 13) | 0);
        var w = 1 + ((rand() * 2) | 0);
        var h = 1 + ((rand() * 2) | 0);
        for (var yy = y; yy < y + h && yy < SIZE - 1; yy++) {
          for (var xx = x; xx < x + w && xx < SIZE - 1; xx++) {
            var n = (rand() * 2 - 1) * 20;
            px(ctx, xx, yy, rgb(color[0] + n, color[1] + n, color[2] + n));
          }
        }
      }
    };
  }
  ore('coal_ore', [40, 40, 40]);
  ore('iron_ore', [196, 160, 128]);
  ore('gold_ore', [240, 200, 60]);
  ore('diamond_ore', [90, 220, 220]);

  builders.sandstone = function (ctx, rand) {
    noisyFill(ctx, [216, 202, 152], 10, rand);
    // horizontal bands
    for (var x = 0; x < SIZE; x++) {
      px(ctx, x, 0, 'rgb(232,220,176)');
      px(ctx, x, 4, 'rgb(196,182,132)');
      px(ctx, x, 11, 'rgb(196,182,132)');
      px(ctx, x, 15, 'rgb(180,166,118)');
    }
  };

  builders.brick = function (ctx, rand) {
    // mortar
    noisyFill(ctx, [176, 168, 160], 6, rand);
    var rows = [0, 4, 8, 12];
    for (var r = 0; r < rows.length; r++) {
      var y0 = rows[r];
      var offset = (r % 2 === 0) ? 0 : 4;
      for (var bx = -8; bx < SIZE; bx += 8) {
        var x0 = bx + offset;
        var base = 150 + ((rand() * 30) | 0);
        for (var y = y0; y < y0 + 3; y++) {
          for (var x = x0; x < x0 + 7; x++) {
            if (x < 0 || x >= SIZE) continue;
            var n = (rand() * 2 - 1) * 12;
            px(ctx, x, y, rgb(base + n, base * 0.45 + n, base * 0.38 + n));
          }
        }
      }
    }
  };

  builders.crafting_table_top = function (ctx, rand) {
    builders.planks(ctx, rand);
    // grid lines
    for (var i = 0; i < SIZE; i++) {
      px(ctx, i, 0, 'rgb(90,62,34)');
      px(ctx, i, 5, 'rgb(90,62,34)');
      px(ctx, i, 10, 'rgb(90,62,34)');
      px(ctx, i, 15, 'rgb(90,62,34)');
      px(ctx, 0, i, 'rgb(90,62,34)');
      px(ctx, 5, i, 'rgb(90,62,34)');
      px(ctx, 10, i, 'rgb(90,62,34)');
      px(ctx, 15, i, 'rgb(90,62,34)');
    }
  };

  builders.crafting_table_side = function (ctx, rand) {
    builders.planks(ctx, rand);
    // tool silhouettes on the lower half
    ctx.fillStyle = 'rgb(70,48,26)';
    ctx.fillRect(2, 9, 5, 1);
    ctx.fillRect(4, 6, 1, 4);
    ctx.fillRect(9, 6, 1, 5);
    ctx.fillRect(9, 6, 4, 1);
    ctx.fillRect(9, 10, 4, 1);
    ctx.fillRect(12, 6, 1, 5);
  };

  builders.tnt_side = function (ctx, rand) {
    // red body
    noisyFill(ctx, [196, 52, 40], 14, rand);
    // white band with "TNT"
    for (var y = 5; y < 11; y++) {
      for (var x = 0; x < SIZE; x++) {
        var n = (rand() * 2 - 1) * 8;
        px(ctx, x, y, rgb(232 + n, 228 + n, 220 + n));
      }
    }
    var letters = [
      // T
      [1, 6], [2, 6], [3, 6], [2, 7], [2, 8], [2, 9],
      // N
      [6, 6], [6, 7], [6, 8], [6, 9], [7, 7], [8, 8], [9, 6], [9, 7], [9, 8], [9, 9],
      // T
      [12, 6], [13, 6], [14, 6], [13, 7], [13, 8], [13, 9]
    ];
    for (var i = 0; i < letters.length; i++) px(ctx, letters[i][0], letters[i][1], 'rgb(40,40,40)');
  };

  builders.tnt_top = function (ctx, rand) {
    noisyFill(ctx, [196, 52, 40], 14, rand);
    // fuse
    ctx.fillStyle = 'rgb(60,60,60)';
    ctx.fillRect(7, 7, 2, 2);
    ctx.fillStyle = 'rgb(200,180,120)';
    ctx.fillRect(7, 4, 1, 3);
    ctx.fillRect(8, 3, 1, 1);
  };

  builders.tnt_bottom = function (ctx, rand) {
    noisyFill(ctx, [150, 40, 32], 14, rand);
  };

  builders.glowstone = function (ctx, rand) {
    noisyFill(ctx, [230, 200, 110], 18, rand);
    speckle(ctx, rand, 50, ['rgb(255,236,160)', 'rgb(200,160,70)', 'rgb(250,220,130)']);
  };

  builders.obsidian = function (ctx, rand) {
    noisyFill(ctx, [30, 22, 46], 12, rand);
    speckle(ctx, rand, 30, ['rgb(60,44,86)', 'rgb(18,12,28)', 'rgb(80,60,110)']);
  };

  function wool(name, color) {
    builders[name] = function (ctx, rand) {
      noisyFill(ctx, color, 10, rand);
      // woven pattern
      for (var y = 0; y < SIZE; y++) {
        for (var x = 0; x < SIZE; x++) {
          if ((x + y) % 4 === 0) {
            var n = (rand() * 2 - 1) * 6;
            px(ctx, x, y, rgb(color[0] - 14 + n, color[1] - 14 + n, color[2] - 14 + n));
          }
        }
      }
    };
  }
  wool('wool_white', [232, 232, 232]);
  wool('wool_red', [176, 46, 38]);
  wool('wool_blue', [52, 68, 168]);
  wool('wool_green', [86, 130, 40]);
  wool('wool_yellow', [248, 198, 40]);
  wool('wool_black', [28, 28, 28]);

  // ---------------------------------------------------------------- build
  var cache = {};
  var order = [];

  function build(name) {
    var c = makeCanvas();
    var ctx = ctxOf(c);
    var fn = builders[name];
    if (!fn) return null;
    fn(ctx, rng(hashString(name)));
    return c;
  }

  function get(name) {
    if (!name) return null;
    if (Object.prototype.hasOwnProperty.call(cache, name)) return cache[name];
    if (!builders[name]) return null;
    var c = build(name);
    cache[name] = c;
    order.push(name);
    return c;
  }

  // ---------------------------------------------------------------- atlas
  var atlasCache = null;

  function atlas() {
    if (atlasCache) return atlasCache;
    var names = Object.keys(builders);
    var cols = Math.ceil(Math.sqrt(names.length));
    var rows = Math.ceil(names.length / cols);
    var c = document.createElement('canvas');
    c.width = cols * TILE;
    c.height = rows * TILE;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var index = {};
    for (var i = 0; i < names.length; i++) {
      var tx = i % cols;
      var ty = (i / cols) | 0;
      ctx.drawImage(get(names[i]), tx * TILE, ty * TILE);
      index[names[i]] = i;
    }
    atlasCache = { canvas: c, tile: TILE, cols: cols, rows: rows, index: index };
    return atlasCache;
  }

  function uv(name) {
    var a = atlas();
    var i = a.index[name];
    if (i === undefined) return null;
    var tx = i % a.cols;
    var ty = (i / a.cols) | 0;
    var w = a.canvas.width;
    var h = a.canvas.height;
    return {
      u0: (tx * TILE) / w,
      v0: (ty * TILE) / h,
      u1: ((tx + 1) * TILE) / w,
      v1: ((ty + 1) * TILE) / h
    };
  }

  // ---------------------------------------------------------------- cracks
  // 10 stages of break overlay (stage 0 = lightest, 9 = almost gone).
  var crackCache = null;

  function breakStage(stage) {
    stage = Math.max(0, Math.min(9, stage | 0));
    if (!crackCache) crackCache = [];
    if (crackCache[stage]) return crackCache[stage];
    var c = makeCanvas();
    var ctx = ctxOf(c);
    ctx.clearRect(0, 0, SIZE, SIZE);
    var rand = rng(0xC0FFEE);
    // generate a fixed set of crack pixels, reveal more as the stage grows
    var total = 150;
    var reveal = Math.round(total * ((stage + 1) / 10));
    // start from the centre and grow outward
    var pts = [];
    for (var i = 0; i < total; i++) {
      var ang = rand() * Math.PI * 2;
      var dist = Math.pow(rand(), 0.7) * 9;
      var x = Math.round(7.5 + Math.cos(ang) * dist);
      var y = Math.round(7.5 + Math.sin(ang) * dist);
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
      pts.push([x, y]);
    }
    for (var p = 0; p < reveal && p < pts.length; p++) {
      px(ctx, pts[p][0], pts[p][1], 'rgba(0,0,0,0.55)');
    }
    crackCache[stage] = c;
    return c;
  }

  function breakStages() {
    var out = [];
    for (var i = 0; i < 10; i++) out.push(breakStage(i));
    return out;
  }

  // ---------------------------------------------------------------- misc
  function avgColor(name) {
    var c = get(name);
    if (!c) return [255, 0, 255];
    var d = ctxOf(c).getImageData(0, 0, SIZE, SIZE).data;
    var r = 0, g = 0, b = 0, n = 0;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    if (!n) return [255, 0, 255];
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  }

  function dataURL(name) {
    var c = get(name);
    return c ? c.toDataURL('image/png') : null;
  }

  // Block -> face texture mapping. Blocks not listed here use their own name
  // for every face (e.g. 'stone' -> stone on all sides).
  var blocks = {
    grass: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' },
    dirt: { top: 'dirt', side: 'dirt', bottom: 'dirt' },
    stone: { top: 'stone', side: 'stone', bottom: 'stone' },
    cobblestone: { top: 'cobblestone', side: 'cobblestone', bottom: 'cobblestone' },
    sand: { top: 'sand', side: 'sand', bottom: 'sand' },
    gravel: { top: 'gravel', side: 'gravel', bottom: 'gravel' },
    bedrock: { top: 'bedrock', side: 'bedrock', bottom: 'bedrock' },
    log: { top: 'log_top', side: 'log_side', bottom: 'log_top' },
    planks: { top: 'planks', side: 'planks', bottom: 'planks' },
    leaves: { top: 'leaves', side: 'leaves', bottom: 'leaves' },
    water: { top: 'water', side: 'water', bottom: 'water' },
    glass: { top: 'glass', side: 'glass', bottom: 'glass' },
    snow: { top: 'snow', side: 'snow', bottom: 'snow' },
    coal_ore: { top: 'coal_ore', side: 'coal_ore', bottom: 'coal_ore' },
    iron_ore: { top: 'iron_ore', side: 'iron_ore', bottom: 'iron_ore' },
    gold_ore: { top: 'gold_ore', side: 'gold_ore', bottom: 'gold_ore' },
    diamond_ore: { top: 'diamond_ore', side: 'diamond_ore', bottom: 'diamond_ore' },
    sandstone: { top: 'sandstone', side: 'sandstone', bottom: 'sandstone' },
    brick: { top: 'brick', side: 'brick', bottom: 'brick' },
    crafting_table: { top: 'crafting_table_top', side: 'crafting_table_side', bottom: 'planks' },
    tnt: { top: 'tnt_top', side: 'tnt_side', bottom: 'tnt_bottom' },
    glowstone: { top: 'glowstone', side: 'glowstone', bottom: 'glowstone' },
    obsidian: { top: 'obsidian', side: 'obsidian', bottom: 'obsidian' },
    wool_white: { top: 'wool_white', side: 'wool_white', bottom: 'wool_white' },
    wool_red: { top: 'wool_red', side: 'wool_red', bottom: 'wool_red' },
    wool_blue: { top: 'wool_blue', side: 'wool_blue', bottom: 'wool_blue' },
    wool_green: { top: 'wool_green', side: 'wool_green', bottom: 'wool_green' },
    wool_yellow: { top: 'wool_yellow', side: 'wool_yellow', bottom: 'wool_yellow' },
    wool_black: { top: 'wool_black', side: 'wool_black', bottom: 'wool_black' }
  };

  function blockFaces(blockName) {
    if (blocks[blockName]) return blocks[blockName];
    if (builders[blockName]) return { top: blockName, side: blockName, bottom: blockName };
    return { top: 'stone', side: 'stone', bottom: 'stone' };
  }

  var api = {
    SIZE: SIZE,
    TILE: TILE,
    get: get,
    canvas: get,
    has: function (name) { return !!builders[name]; },
    names: function () { return Object.keys(builders); },
    dataURL: dataURL,
    atlas: atlas,
    uv: uv,
    breakStage: breakStage,
    breakStages: breakStages,
    avgColor: avgColor,
    blocks: blocks,
    blockFaces: blockFaces,
    _builders: builders
  };

  global.Textures = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
