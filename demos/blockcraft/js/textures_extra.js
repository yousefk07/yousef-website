/* Extra textures for the full block registry. Loaded after js/textures.js.
 * Registers into the same builder table so the atlas includes them. */
(function (global) {
  'use strict';
  var T = global.Textures;
  if (!T || !T._builders) return;
  var B = T._builders;
  var SIZE = 16;

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
  function hash(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function fill(ctx, r, g, b, noise, rand) {
    for (var y = 0; y < SIZE; y++) for (var x = 0; x < SIZE; x++) {
      var n = (rand() * 2 - 1) * noise;
      ctx.fillStyle = 'rgb(' + Math.max(0, Math.min(255, r + n | 0)) + ',' + Math.max(0, Math.min(255, g + n | 0)) + ',' + Math.max(0, Math.min(255, b + n | 0)) + ')';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  function clear(ctx) { ctx.clearRect(0, 0, SIZE, SIZE); }
  function dot(ctx, x, y, col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
  function speck(ctx, rand, n, cols) {
    for (var i = 0; i < n; i++) dot(ctx, (rand() * SIZE) | 0, (rand() * SIZE) | 0, cols[(rand() * cols.length) | 0]);
  }
  function simple(name, r, g, b, noise, extra) {
    B[name] = function (ctx, rand) {
      fill(ctx, r, g, b, noise, rand);
      if (extra) extra(ctx, rand);
    };
  }
  function alias(name, src) { B[name] = B[src]; }

  // ---- natural blocks
  simple('clay', 160, 166, 179, 10, function (c, r) { speck(c, r, 18, ['rgb(140,146,160)', 'rgb(176,182,194)']); });
  simple('mossy_stone', 110, 112, 104, 18, function (c, r) {
    for (var i = 0; i < 40; i++) dot(c, (r() * 16) | 0, (r() * 16) | 0, 'rgb(' + (70 + r() * 40 | 0) + ',' + (110 + r() * 40 | 0) + ',60)');
    for (var k = 0; k < 6; k++) { var x = (r() * 14) | 0, y = (r() * 14) | 0; dot(c, x, y, 'rgb(70,70,70)'); dot(c, x + 1, y, 'rgb(70,70,70)'); }
  });
  simple('netherrack', 110, 40, 40, 22, function (c, r) { speck(c, r, 30, ['rgb(80,24,24)', 'rgb(140,60,60)']); });
  simple('quartz', 232, 228, 220, 8, function (c, r) { speck(c, r, 12, ['rgb(210,206,198)']); });
  simple('terracotta', 152, 94, 67, 12, function (c, r) { speck(c, r, 16, ['rgb(132,78,54)', 'rgb(170,110,80)']); });
  simple('farmland', 110, 76, 50, 14, function (c, r) {
    for (var y = 1; y < 16; y += 4) for (var x = 0; x < 16; x++) dot(c, x, y, 'rgb(80,54,34)');
  });
  simple('path', 150, 124, 80, 12, function (c, r) { speck(c, r, 20, ['rgb(128,104,66)', 'rgb(170,144,96)']); });
  simple('podzol_top', 96, 64, 30, 16, function (c, r) { speck(c, r, 30, ['rgb(120,84,40)', 'rgb(70,46,20)']); });
  simple('mycelium_top', 130, 116, 130, 14, function (c, r) { speck(c, r, 30, ['rgb(160,140,160)', 'rgb(100,88,100)']); });
  simple('snow_side', 236, 240, 246, 6, function (c, r) {
    for (var x = 0; x < 16; x++) { var d = 3 + ((r() * 3) | 0); for (var y = d; y < 16; y++) dot(c, x, y, 'rgb(' + (120 + r() * 30 | 0) + ',' + (86 + r() * 20 | 0) + ',60)'); }
  });
  simple('stone_bricks', 122, 122, 122, 10, function (c, r) {
    for (var x = 0; x < 16; x++) { dot(c, x, 7, 'rgb(80,80,80)'); dot(c, x, 15, 'rgb(80,80,80)'); }
    for (var y = 0; y < 7; y++) dot(c, 7, y, 'rgb(80,80,80)');
    for (var y2 = 8; y2 < 15; y2++) dot(c, 3, y2, 'rgb(80,80,80)');
  });
  simple('cracked_stone', 118, 118, 118, 10, function (c, r) {
    for (var i = 0; i < 14; i++) dot(c, (r() * 16) | 0, (r() * 16) | 0, 'rgb(70,70,70)');
  });
  simple('chiseled_stone', 126, 126, 126, 8, function (c, r) {
    for (var x = 3; x < 13; x++) { dot(c, x, 3, 'rgb(90,90,90)'); dot(c, x, 12, 'rgb(90,90,90)'); }
    for (var y = 3; y < 13; y++) { dot(c, 3, y, 'rgb(90,90,90)'); dot(c, 12, y, 'rgb(90,90,90)'); }
  });
  simple('lava', 220, 90, 20, 30, function (c, r) { speck(c, r, 40, ['rgb(255,200,40)', 'rgb(180,50,10)', 'rgb(255,140,30)']); });
  simple('ice', 160, 200, 240, 10, function (c, r) { speck(c, r, 14, ['rgb(200,230,255)', 'rgb(130,180,230)']); });
  simple('torch', 0, 0, 0, 0, function (c, r) {
    clear(c);
    for (var y = 6; y < 16; y++) { dot(c, 7, y, 'rgb(120,84,40)'); dot(c, 8, y, 'rgb(96,66,30)'); }
    dot(c, 7, 4, 'rgb(255,220,90)'); dot(c, 8, 4, 'rgb(255,200,60)');
    dot(c, 7, 5, 'rgb(255,160,40)'); dot(c, 8, 5, 'rgb(255,140,30)');
    dot(c, 7, 3, 'rgb(255,250,200)'); dot(c, 8, 3, 'rgb(255,240,160)');
  });
  simple('bookshelf', 150, 110, 70, 8, function (c, r) {
    for (var x = 0; x < 16; x++) { dot(c, x, 0, 'rgb(110,80,50)'); dot(c, x, 15, 'rgb(110,80,50)'); dot(c, x, 7, 'rgb(110,80,50)'); dot(c, x, 8, 'rgb(110,80,50)'); }
    var cols = ['rgb(160,40,40)', 'rgb(40,80,160)', 'rgb(60,140,60)', 'rgb(200,180,80)', 'rgb(140,60,140)'];
    for (var y = 1; y < 7; y++) for (var x2 = 1; x2 < 15; x2++) if (r() < 0.85) dot(c, x2, y, cols[(x2 / 2) | 0 % cols.length]);
    for (var y2 = 9; y2 < 15; y2++) for (var x3 = 1; x3 < 15; x3++) if (r() < 0.85) dot(c, x3, y2, cols[((x3 + 2) / 2 | 0) % cols.length]);
  });
  simple('sponge', 200, 190, 70, 20, function (c, r) { speck(c, r, 40, ['rgb(160,150,50)', 'rgb(220,210,90)']); });
  simple('cactus_side', 60, 130, 50, 12, function (c, r) {
    for (var y = 0; y < 16; y++) { dot(c, 0, y, 'rgb(40,100,36)'); dot(c, 15, y, 'rgb(40,100,36)'); }
    for (var i = 0; i < 10; i++) dot(c, 3 + ((r() * 10) | 0), (r() * 16) | 0, 'rgb(220,230,200)');
  });
  simple('cactus_top', 70, 140, 56, 12, function (c, r) {
    for (var i = 0; i < 16; i++) { dot(c, i, 0, 'rgb(40,100,36)'); dot(c, i, 15, 'rgb(40,100,36)'); dot(c, 0, i, 'rgb(40,100,36)'); dot(c, 15, i, 'rgb(40,100,36)'); }
    speck(c, r, 10, ['rgb(200,220,180)']);
  });
  simple('pumpkin_side', 220, 130, 30, 12, function (c, r) {
    for (var x = 2; x < 16; x += 4) for (var y = 0; y < 16; y++) dot(c, x, y, 'rgb(170,90,20)');
    for (var y2 = 0; y2 < 16; y2++) { dot(c, 0, y2, 'rgb(150,80,20)'); dot(c, 15, y2, 'rgb(150,80,20)'); }
  });
  simple('pumpkin_top', 210, 140, 40, 12, function (c, r) {
    for (var i = 0; i < 16; i++) { dot(c, i, 0, 'rgb(150,90,20)'); dot(c, i, 15, 'rgb(150,90,20)'); dot(c, 0, i, 'rgb(150,90,20)'); dot(c, 15, i, 'rgb(150,90,20)'); }
    for (var y = 6; y < 10; y++) for (var x = 6; x < 10; x++) dot(c, x, y, 'rgb(110,80,30)');
  });
  // ---- ores
  function ore(name, r, g, b) {
    B[name] = function (ctx, rand) {
      B.stone(ctx, rand);
      for (var i = 0; i < 5; i++) {
        var x = 1 + ((rand() * 12) | 0), y = 1 + ((rand() * 12) | 0);
        dot(ctx, x, y, 'rgb(' + r + ',' + g + ',' + b + ')');
        dot(ctx, x + 1, y, 'rgb(' + (r * 0.8 | 0) + ',' + (g * 0.8 | 0) + ',' + (b * 0.8 | 0) + ')');
        dot(ctx, x, y + 1, 'rgb(' + (r * 0.9 | 0) + ',' + (g * 0.9 | 0) + ',' + (b * 0.9 | 0) + ')');
      }
    };
  }
  ore('emerald_ore', 40, 220, 90);
  ore('lapis_ore', 40, 70, 200);
  ore('redstone_ore', 220, 30, 30);
  // ---- metal / gem blocks
  function metal(name, r, g, b) {
    B[name] = function (ctx, rand) {
      fill(ctx, r, g, b, 10, rand);
      for (var i = 0; i < 16; i++) { dot(ctx, i, 0, 'rgb(' + (r * 1.2 | 0) + ',' + (g * 1.2 | 0) + ',' + (b * 1.2 | 0) + ')'); dot(ctx, i, 15, 'rgb(' + (r * 0.7 | 0) + ',' + (g * 0.7 | 0) + ',' + (b * 0.7 | 0) + ')'); }
      for (var k = 0; k < 6; k++) dot(ctx, (rand() * 16) | 0, (rand() * 16) | 0, 'rgb(' + (r * 1.3 | 0) + ',' + (g * 1.3 | 0) + ',' + (b * 1.3 | 0) + ')');
    };
  }
  metal('coal_block', 30, 30, 30);
  metal('iron_block', 220, 220, 220);
  metal('gold_block', 250, 210, 60);
  metal('diamond_block', 100, 230, 220);
  metal('emerald_block', 40, 200, 90);
  metal('lapis_block', 40, 70, 190);
  metal('redstone_block', 190, 20, 20);
  metal('quartz_block', 235, 230, 222);
  // ---- planks / logs / leaves
  function planks(name, r, g, b) {
    B[name] = function (ctx, rand) {
      fill(ctx, r, g, b, 10, rand);
      for (var y = 3; y < 16; y += 4) for (var x = 0; x < 16; x++) dot(ctx, x, y, 'rgb(' + (r * 0.7 | 0) + ',' + (g * 0.7 | 0) + ',' + (b * 0.7 | 0) + ')');
      for (var i = 0; i < 8; i++) dot(ctx, (rand() * 16) | 0, (rand() * 16) | 0, 'rgb(' + (r * 1.15 | 0) + ',' + (g * 1.15 | 0) + ',' + (b * 1.15 | 0) + ')');
    };
  }
  planks('birch_planks', 216, 200, 150);
  planks('spruce_planks', 110, 80, 48);
  planks('dark_oak_planks', 70, 48, 26);
  function bark(name, r, g, b) {
    B[name] = function (ctx, rand) {
      fill(ctx, r, g, b, 14, rand);
      for (var x = 0; x < 16; x += 3) for (var y = 0; y < 16; y++) if (rand() < 0.7) dot(ctx, x, y, 'rgb(' + (r * 0.75 | 0) + ',' + (g * 0.75 | 0) + ',' + (b * 0.75 | 0) + ')');
    };
  }
  bark('birch_log_side', 220, 220, 210);
  bark('spruce_log_side', 70, 50, 30);
  function leaves(name, r, g, b) {
    B[name] = function (ctx, rand) {
      clear(ctx);
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        if (rand() < 0.16) continue;
        var n = (rand() * 2 - 1) * 26;
        dot(ctx, x, y, 'rgb(' + Math.max(0, r + n | 0) + ',' + Math.max(0, g + n | 0) + ',' + Math.max(0, b + n | 0) + ')');
      }
    };
  }
  leaves('birch_leaves', 120, 170, 80);
  leaves('spruce_leaves', 50, 100, 60);
  leaves('jungle_leaves', 50, 140, 40);
  leaves('acacia_leaves', 110, 160, 50);
  leaves('dark_oak_leaves', 50, 110, 40);
  // ---- plants (transparent)
  function plant(name, draw) {
    B[name] = function (ctx, rand) { clear(ctx); draw(ctx, rand); };
  }
  plant('tall_grass', function (c, r) {
    for (var i = 0; i < 9; i++) {
      var x = 1 + ((r() * 14) | 0), h = 4 + ((r() * 10) | 0);
      for (var y = 15; y > 15 - h; y--) dot(c, x, y, 'rgb(' + (70 + r() * 50 | 0) + ',' + (130 + r() * 50 | 0) + ',50)');
    }
  });
  function flower(name, petal, centre) {
    plant(name, function (c, r) {
      for (var y = 8; y < 16; y++) dot(c, 7, y, 'rgb(60,120,40)');
      dot(c, 6, 12, 'rgb(60,120,40)'); dot(c, 8, 10, 'rgb(60,120,40)');
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;
        dot(c, 7 + dx, 5 + dy, petal);
      }
      dot(c, 7, 5, centre);
    });
  }
  flower('flower_red', 'rgb(210,40,40)', 'rgb(60,20,20)');
  flower('flower_yellow', 'rgb(240,220,50)', 'rgb(200,160,20)');
  plant('dead_bush', function (c, r) {
    for (var i = 0; i < 6; i++) {
      var x = 4 + ((r() * 8) | 0);
      for (var y = 15; y > 6 + ((r() * 6) | 0); y--) dot(c, x, y, 'rgb(' + (120 + r() * 40 | 0) + ',' + (80 + r() * 30 | 0) + ',40)');
    }
  });
  plant('sugar_cane', function (c, r) {
    for (var x = 3; x < 13; x += 3) for (var y = 0; y < 16; y++) dot(c, x, y, 'rgb(' + (140 + r() * 40 | 0) + ',' + (190 + r() * 40 | 0) + ',110)');
  });
  function sapling(name, leaf) {
    plant(name, function (c, r) {
      for (var y = 10; y < 16; y++) dot(c, 7, y, 'rgb(110,80,40)');
      for (var dy = -3; dy <= 2; dy++) for (var dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy > 9) continue;
        if (r() < 0.2) continue;
        dot(c, 7 + dx, 6 + dy, leaf);
      }
    });
  }
  sapling('oak_sapling', 'rgb(70,140,50)');
  sapling('birch_sapling', 'rgb(130,180,90)');
  sapling('spruce_sapling', 'rgb(50,100,60)');
  sapling('jungle_sapling', 'rgb(50,150,40)');
  sapling('acacia_sapling', 'rgb(120,170,60)');
  sapling('dark_oak_sapling', 'rgb(50,110,40)');
  // ---- wool
  function wool(name, r, g, b) {
    B[name] = function (ctx, rand) {
      fill(ctx, r, g, b, 8, rand);
      for (var i = 0; i < 20; i++) dot(ctx, (rand() * 16) | 0, (rand() * 16) | 0, 'rgb(' + Math.min(255, r * 1.15 | 0) + ',' + Math.min(255, g * 1.15 | 0) + ',' + Math.min(255, b * 1.15 | 0) + ')');
    };
  }
  wool('wool_orange', 240, 140, 40);
  wool('wool_purple', 130, 60, 180);
  wool('wool_cyan', 40, 160, 180);
  wool('wool_pink', 240, 150, 180);
  wool('wool_lime', 120, 200, 40);
  wool('wool_gray', 90, 90, 90);
  wool('wool_brown', 110, 70, 40);
  wool('wool_magenta', 190, 70, 190);
  wool('wool_light_gray', 170, 170, 170);
  wool('wool_light_blue', 100, 160, 230);
  // ---- fallback
  B.missing = function (ctx) {
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      dot(ctx, x, y, ((x >> 2) + (y >> 2)) % 2 ? 'rgb(255,0,255)' : 'rgb(0,0,0)');
    }
  };
  alias('snow_side_alias', 'snow_side');
})(window);
