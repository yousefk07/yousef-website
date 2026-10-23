/* HUD: hotbar, block picker, info line, toasts, held-item name. */
(function (global) {
  'use strict';
  var Blocks = global.Blocks;

  function iconCanvas(id, size) {
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var b = Blocks.list[id];
    if (!b) return c;
    var top = global.Textures.get(b.tex.top), side = global.Textures.get(b.tex.side);
    if (!top) return c;
    if (b.cross) {
      ctx.drawImage(top, 0, 0, size, size);
      return c;
    }
    // isometric-ish cube: top face + two sides
    var s = size, h = s * 0.5;
    // top (parallelogram)
    ctx.save();
    ctx.setTransform(0.866, 0.5, -0.866, 0.5, s / 2, 0);
    ctx.drawImage(top, 0, 0, s, s * 0.5);
    ctx.restore();
    // left side
    ctx.save();
    ctx.setTransform(0.866, 0.5, 0, 1, 0, s * 0.25);
    ctx.globalAlpha = 0.8;
    ctx.drawImage(side, 0, 0, s * 0.5, s * 0.5);
    ctx.restore();
    // right side
    ctx.save();
    ctx.setTransform(0.866, -0.5, 0, 1, s * 0.5, s * 0.5);
    ctx.globalAlpha = 0.62;
    ctx.drawImage(side, 0, 0, s * 0.5, s * 0.5);
    ctx.restore();
    return c;
  }

  function UI() {
    this.hotbarEl = document.getElementById('hotbar');
    this.infoEl = document.getElementById('info');
    this.nameEl = document.getElementById('heldname');
    this.toastEl = document.getElementById('toast');
    this.pickerEl = document.getElementById('picker');
    this.gridEl = document.getElementById('pickerGrid');
    this.waterEl = document.getElementById('water-overlay');
    this.slots = [];
    this.nameTimer = 0;
    this.toastTimer = 0;
    this.buildHotbar();
    this.buildPicker();
  }

  UI.prototype.buildHotbar = function () {
    this.hotbarEl.innerHTML = '';
    this.slots = [];
    for (var i = 0; i < 9; i++) {
      var d = document.createElement('div');
      d.className = 'slot';
      var n = document.createElement('span');
      n.className = 'num';
      n.textContent = String(i + 1);
      d.appendChild(n);
      this.hotbarEl.appendChild(d);
      this.slots.push(d);
    }
  };

  UI.prototype.setHotbar = function (items, sel) {
    for (var i = 0; i < 9; i++) {
      var d = this.slots[i];
      var id = items[i];
      var old = d.querySelector('canvas');
      if (old) old.remove();
      if (id) d.appendChild(iconCanvas(id, 36));
      d.classList.toggle('sel', i === sel);
    }
  };

  UI.prototype.showName = function (id) {
    this.nameEl.textContent = Blocks.displayName ? Blocks.displayName(id) : '';
    this.nameEl.classList.add('show');
    this.nameTimer = 1.6;
  };

  UI.prototype.toast = function (msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastTimer = 2.2;
  };

  UI.prototype.update = function (dt) {
    if (this.nameTimer > 0) {
      this.nameTimer -= dt;
      if (this.nameTimer <= 0) this.nameEl.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  };

  UI.prototype.setInfo = function (text) {
    this.infoEl.textContent = text;
  };

  UI.prototype.setUnderwater = function (on) {
    this.waterEl.classList.toggle('on', !!on);
  };

  UI.prototype.buildPicker = function () {
    var self = this;
    this.gridEl.innerHTML = '';
    var list = Blocks.creativeList || [];
    list.forEach(function (id) {
      var d = document.createElement('div');
      d.className = 'pick';
      d.title = Blocks.displayName(id);
      d.appendChild(iconCanvas(id, 40));
      d.addEventListener('click', function (e) {
        e.stopPropagation();
        if (self.onPick) self.onPick(id);
      });
      self.gridEl.appendChild(d);
    });
  };

  UI.prototype.showPicker = function (on) {
    this.pickerEl.classList.toggle('hidden', !on);
  };

  UI.iconCanvas = iconCanvas;
  global.UI = UI;
})(window);
