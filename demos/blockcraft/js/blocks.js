/* Block registry. window.Blocks */
(function (global) {
  'use strict';

  // id, name, display, top, side, bottom, flags
  // flags: s=solid, o=opaque, l=liquid, t=transparent, x=cross, h=hardness, m=sound material, g=light
  var DEFS = [
    [0, 'air', 'Air', 'missing', 'missing', 'missing', { h: 0, t: true }],
    [1, 'stone', 'Stone', 'stone', 'stone', 'stone', { h: 1.5, m: 'stone' }],
    [2, 'grass', 'Grass Block', 'grass_top', 'grass_side', 'dirt', { h: 0.5, m: 'grass' }],
    [3, 'dirt', 'Dirt', 'dirt', 'dirt', 'dirt', { h: 0.5, m: 'dirt' }],
    [4, 'cobblestone', 'Cobblestone', 'cobblestone', 'cobblestone', 'cobblestone', { h: 1.5, m: 'stone' }],
    [5, 'oak_planks', 'Oak Planks', 'planks', 'planks', 'planks', { h: 1.0, m: 'wood' }],
    [6, 'sand', 'Sand', 'sand', 'sand', 'sand', { h: 0.5, m: 'sand' }],
    [7, 'oak_log', 'Oak Log', 'log_top', 'log_side', 'log_top', { h: 1.0, m: 'wood' }],
    [8, 'oak_leaves', 'Oak Leaves', 'leaves', 'leaves', 'leaves', { h: 0.2, m: 'leaves', t: true }],
    [9, 'water', 'Water', 'water', 'water', 'water', { l: true, t: true, h: Infinity, m: 'water' }],
    [10, 'glass', 'Glass', 'glass', 'glass', 'glass', { h: 0.3, m: 'glass', t: true }],
    [11, 'bedrock', 'Bedrock', 'bedrock', 'bedrock', 'bedrock', { h: Infinity, m: 'stone' }],
    [12, 'snow_block', 'Snow Block', 'snow', 'snow_side', 'dirt', { h: 0.5, m: 'snow' }],
    [13, 'coal_ore', 'Coal Ore', 'coal_ore', 'coal_ore', 'coal_ore', { h: 1.5, m: 'stone' }],
    [14, 'iron_ore', 'Iron Ore', 'iron_ore', 'iron_ore', 'iron_ore', { h: 1.5, m: 'stone' }],
    [15, 'gold_ore', 'Gold Ore', 'gold_ore', 'gold_ore', 'gold_ore', { h: 1.5, m: 'stone' }],
    [16, 'diamond_ore', 'Diamond Ore', 'diamond_ore', 'diamond_ore', 'diamond_ore', { h: 1.5, m: 'stone' }],
    [17, 'brick', 'Bricks', 'brick', 'brick', 'brick', { h: 1.5, m: 'stone' }],
    [18, 'crafting_table', 'Crafting Table', 'crafting_table_top', 'crafting_table_side', 'planks', { h: 1.0, m: 'wood' }],
    [19, 'torch', 'Torch', 'torch', 'torch', 'torch', { x: true, h: 0, m: 'wood', g: 14 }],
    [20, 'glowstone', 'Glowstone', 'glowstone', 'glowstone', 'glowstone', { h: 0.3, m: 'glass', g: 15 }],
    [21, 'obsidian', 'Obsidian', 'obsidian', 'obsidian', 'obsidian', { h: 50, m: 'stone' }],
    [22, 'sandstone', 'Sandstone', 'sandstone', 'sandstone', 'sandstone', { h: 1.5, m: 'stone' }],
    [23, 'gravel', 'Gravel', 'gravel', 'gravel', 'gravel', { h: 0.5, m: 'gravel' }],
    [24, 'ice', 'Ice', 'ice', 'ice', 'ice', { h: 0.3, m: 'glass', t: true }],
    [25, 'clay', 'Clay', 'clay', 'clay', 'clay', { h: 0.5, m: 'dirt' }],
    [26, 'mossy_stone', 'Mossy Cobblestone', 'mossy_stone', 'mossy_stone', 'mossy_stone', { h: 1.5, m: 'stone' }],
    [27, 'birch_log', 'Birch Log', 'log_top', 'birch_log_side', 'log_top', { h: 1.0, m: 'wood' }],
    [28, 'spruce_log', 'Spruce Log', 'log_top', 'spruce_log_side', 'log_top', { h: 1.0, m: 'wood' }],
    [29, 'birch_leaves', 'Birch Leaves', 'birch_leaves', 'birch_leaves', 'birch_leaves', { h: 0.2, m: 'leaves', t: true }],
    [30, 'spruce_leaves', 'Spruce Leaves', 'spruce_leaves', 'spruce_leaves', 'spruce_leaves', { h: 0.2, m: 'leaves', t: true }],
    [31, 'cactus', 'Cactus', 'cactus_top', 'cactus_side', 'cactus_top', { h: 0.4, m: 'grass' }],
    [32, 'tall_grass', 'Tall Grass', 'tall_grass', 'tall_grass', 'tall_grass', { x: true, h: 0, m: 'grass' }],
    [33, 'flower_red', 'Poppy', 'flower_red', 'flower_red', 'flower_red', { x: true, h: 0, m: 'grass' }],
    [34, 'flower_yellow', 'Dandelion', 'flower_yellow', 'flower_yellow', 'flower_yellow', { x: true, h: 0, m: 'grass' }],
    [35, 'pumpkin', 'Pumpkin', 'pumpkin_top', 'pumpkin_side', 'pumpkin_top', { h: 0.5, m: 'wood' }],
    [36, 'lapis_ore', 'Lapis Ore', 'lapis_ore', 'lapis_ore', 'lapis_ore', { h: 1.5, m: 'stone' }],
    [37, 'redstone_ore', 'Redstone Ore', 'redstone_ore', 'redstone_ore', 'redstone_ore', { h: 1.5, m: 'stone' }],
    [38, 'emerald_ore', 'Emerald Ore', 'emerald_ore', 'emerald_ore', 'emerald_ore', { h: 1.5, m: 'stone' }],
    [39, 'coal_block', 'Coal Block', 'coal_block', 'coal_block', 'coal_block', { h: 2.5, m: 'stone' }],
    [40, 'iron_block', 'Iron Block', 'iron_block', 'iron_block', 'iron_block', { h: 2.5, m: 'stone' }],
    [41, 'gold_block', 'Gold Block', 'gold_block', 'gold_block', 'gold_block', { h: 2.5, m: 'stone' }],
    [42, 'diamond_block', 'Diamond Block', 'diamond_block', 'diamond_block', 'diamond_block', { h: 2.5, m: 'stone' }],
    [43, 'snow_layer', 'Snow', 'snow', 'snow', 'snow', { h: 0.5, m: 'snow' }],
    [44, 'dead_bush', 'Dead Bush', 'dead_bush', 'dead_bush', 'dead_bush', { x: true, h: 0, m: 'grass' }],
    [45, 'sugar_cane', 'Sugar Cane', 'sugar_cane', 'sugar_cane', 'sugar_cane', { x: true, h: 0, m: 'grass' }],
    [46, 'lava', 'Lava', 'lava', 'lava', 'lava', { l: true, t: true, h: Infinity, m: 'stone', g: 15 }],
    [47, 'stone_bricks', 'Stone Bricks', 'stone_bricks', 'stone_bricks', 'stone_bricks', { h: 1.5, m: 'stone' }],
    [48, 'bookshelf', 'Bookshelf', 'planks', 'bookshelf', 'planks', { h: 1.0, m: 'wood' }],
    [49, 'tnt', 'TNT', 'tnt_top', 'tnt_side', 'tnt_top', { h: 0.2, m: 'grass' }],
    [50, 'sponge', 'Sponge', 'sponge', 'sponge', 'sponge', { h: 0.3, m: 'wool' }],
    [51, 'wool_white', 'White Wool', 'wool_white', 'wool_white', 'wool_white', { h: 0.4, m: 'wool' }],
    [52, 'wool_red', 'Red Wool', 'wool_red', 'wool_red', 'wool_red', { h: 0.4, m: 'wool' }],
    [53, 'wool_blue', 'Blue Wool', 'wool_blue', 'wool_blue', 'wool_blue', { h: 0.4, m: 'wool' }],
    [54, 'wool_green', 'Green Wool', 'wool_green', 'wool_green', 'wool_green', { h: 0.4, m: 'wool' }],
    [55, 'wool_yellow', 'Yellow Wool', 'wool_yellow', 'wool_yellow', 'wool_yellow', { h: 0.4, m: 'wool' }],
    [56, 'wool_black', 'Black Wool', 'wool_black', 'wool_black', 'wool_black', { h: 0.4, m: 'wool' }],
    [57, 'wool_orange', 'Orange Wool', 'wool_orange', 'wool_orange', 'wool_orange', { h: 0.4, m: 'wool' }],
    [58, 'wool_purple', 'Purple Wool', 'wool_purple', 'wool_purple', 'wool_purple', { h: 0.4, m: 'wool' }],
    [59, 'wool_cyan', 'Cyan Wool', 'wool_cyan', 'wool_cyan', 'wool_cyan', { h: 0.4, m: 'wool' }],
    [60, 'wool_pink', 'Pink Wool', 'wool_pink', 'wool_pink', 'wool_pink', { h: 0.4, m: 'wool' }],
    [61, 'wool_lime', 'Lime Wool', 'wool_lime', 'wool_lime', 'wool_lime', { h: 0.4, m: 'wool' }],
    [62, 'wool_gray', 'Gray Wool', 'wool_gray', 'wool_gray', 'wool_gray', { h: 0.4, m: 'wool' }],
    [63, 'wool_brown', 'Brown Wool', 'wool_brown', 'wool_brown', 'wool_brown', { h: 0.4, m: 'wool' }],
    [64, 'wool_magenta', 'Magenta Wool', 'wool_magenta', 'wool_magenta', 'wool_magenta', { h: 0.4, m: 'wool' }],
    [65, 'wool_light_gray', 'Light Gray Wool', 'wool_light_gray', 'wool_light_gray', 'wool_light_gray', { h: 0.4, m: 'wool' }],
    [66, 'wool_light_blue', 'Light Blue Wool', 'wool_light_blue', 'wool_light_blue', 'wool_light_blue', { h: 0.4, m: 'wool' }],
    [67, 'packed_ice', 'Packed Ice', 'ice', 'ice', 'ice', { h: 0.3, m: 'glass' }],
    [68, 'farmland', 'Farmland', 'farmland', 'dirt', 'dirt', { h: 0.5, m: 'dirt' }],
    [69, 'path', 'Dirt Path', 'path', 'dirt', 'dirt', { h: 0.5, m: 'dirt' }],
    [70, 'podzol', 'Podzol', 'podzol_top', 'dirt', 'dirt', { h: 0.5, m: 'dirt' }],
    [71, 'mycelium', 'Mycelium', 'mycelium_top', 'dirt', 'dirt', { h: 0.5, m: 'dirt' }],
    [72, 'terracotta', 'Terracotta', 'terracotta', 'terracotta', 'terracotta', { h: 1.5, m: 'stone' }],
    [73, 'quartz', 'Quartz', 'quartz', 'quartz', 'quartz', { h: 1.5, m: 'stone' }],
    [74, 'emerald_block', 'Emerald Block', 'emerald_block', 'emerald_block', 'emerald_block', { h: 2.5, m: 'stone' }],
    [75, 'lapis_block', 'Lapis Block', 'lapis_block', 'lapis_block', 'lapis_block', { h: 2.5, m: 'stone' }],
    [76, 'redstone_block', 'Redstone Block', 'redstone_block', 'redstone_block', 'redstone_block', { h: 2.5, m: 'stone' }],
    [77, 'quartz_block', 'Quartz Block', 'quartz_block', 'quartz_block', 'quartz_block', { h: 1.5, m: 'stone' }],
    [78, 'cactus_top', 'Cactus Top', 'cactus_top', 'cactus_top', 'cactus_top', { h: 0.4, m: 'grass' }],
    [79, 'pumpkin_top', 'Pumpkin Top', 'pumpkin_top', 'pumpkin_top', 'pumpkin_top', { h: 0.5, m: 'wood' }],
    [80, 'oak_sapling', 'Oak Sapling', 'oak_sapling', 'oak_sapling', 'oak_sapling', { x: true, h: 0, m: 'grass' }],
    [81, 'birch_sapling', 'Birch Sapling', 'birch_sapling', 'birch_sapling', 'birch_sapling', { x: true, h: 0, m: 'grass' }],
    [82, 'spruce_sapling', 'Spruce Sapling', 'spruce_sapling', 'spruce_sapling', 'spruce_sapling', { x: true, h: 0, m: 'grass' }],
    [83, 'jungle_sapling', 'Jungle Sapling', 'jungle_sapling', 'jungle_sapling', 'jungle_sapling', { x: true, h: 0, m: 'grass' }],
    [84, 'acacia_sapling', 'Acacia Sapling', 'acacia_sapling', 'acacia_sapling', 'acacia_sapling', { x: true, h: 0, m: 'grass' }],
    [85, 'dark_oak_sapling', 'Dark Oak Sapling', 'dark_oak_sapling', 'dark_oak_sapling', 'dark_oak_sapling', { x: true, h: 0, m: 'grass' }],
    [86, 'birch_planks', 'Birch Planks', 'birch_planks', 'birch_planks', 'birch_planks', { h: 1.0, m: 'wood' }],
    [87, 'spruce_planks', 'Spruce Planks', 'spruce_planks', 'spruce_planks', 'spruce_planks', { h: 1.0, m: 'wood' }],
    [88, 'dark_oak_planks', 'Dark Oak Planks', 'dark_oak_planks', 'dark_oak_planks', 'dark_oak_planks', { h: 1.0, m: 'wood' }],
    [89, 'jungle_leaves', 'Jungle Leaves', 'jungle_leaves', 'jungle_leaves', 'jungle_leaves', { h: 0.2, m: 'leaves', t: true }],
    [90, 'acacia_leaves', 'Acacia Leaves', 'acacia_leaves', 'acacia_leaves', 'acacia_leaves', { h: 0.2, m: 'leaves', t: true }],
    [91, 'dark_oak_leaves', 'Dark Oak Leaves', 'dark_oak_leaves', 'dark_oak_leaves', 'dark_oak_leaves', { h: 0.2, m: 'leaves', t: true }],
    [92, 'cracked_stone', 'Cracked Stone Bricks', 'cracked_stone', 'cracked_stone', 'cracked_stone', { h: 1.5, m: 'stone' }],
    [93, 'chiseled_stone', 'Chiseled Stone Bricks', 'chiseled_stone', 'chiseled_stone', 'chiseled_stone', { h: 1.5, m: 'stone' }],
    [94, 'netherrack', 'Netherrack', 'netherrack', 'netherrack', 'netherrack', { h: 1.5, m: 'stone' }],
    [95, 'lava_block', 'Lava', 'lava', 'lava', 'lava', { l: true, t: true, h: Infinity, m: 'stone', g: 15 }],
    [96, 'bedrock_flat', 'Bedrock', 'bedrock', 'bedrock', 'bedrock', { h: Infinity, m: 'stone' }]
  ];

  var list = [];
  var byNameMap = {};
  DEFS.forEach(function (d) {
    var f = d[6];
    var b = {
      id: d[0], name: d[1], display: d[2],
      tex: { top: d[3], side: d[4], bottom: d[5] },
      solid: !f.l && !f.x && d[0] !== 0,
      opaque: !f.l && !f.t && !f.x && d[0] !== 0,
      liquid: !!f.l, transparent: !!f.t || !!f.l || !!f.x, cross: !!f.x,
      light: f.g || 0, hardness: f.h, sound: f.m || 'stone'
    };
    list[b.id] = b;
    byNameMap[b.name] = b.id;
  });

  var creativeList = [];
  for (var i = 1; i < list.length; i++) {
    if (i === 9 || i === 46 || i === 95 || i === 43 || i === 67 || i === 78 || i === 79 || i === 96) continue;
    creativeList.push(i);
  }

  global.Blocks = {
    list: list,
    byName: byNameMap,
    creativeList: creativeList,
    isSolid: function (id) { return !!(list[id] && list[id].solid); },
    isOpaque: function (id) { return !!(list[id] && list[id].opaque); },
    isLiquid: function (id) { return !!(list[id] && list[id].liquid); },
    isCross: function (id) { return !!(list[id] && list[id].cross); },
    hardness: function (id) { return list[id] ? list[id].hardness : 1; },
    texFor: function (id, face) {
      var b = list[id];
      if (!b) return 'missing';
      if (face === 2) return b.tex.top;
      if (face === 3) return b.tex.bottom;
      return b.tex.side;
    },
    displayName: function (id) { return list[id] ? list[id].display : 'Unknown'; }
  };
})(window);
