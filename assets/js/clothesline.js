// Clothesline: paintings hang from a sagging rope, sway in a light breeze,
// swing when the pointer brushes past, and open in a lightbox on click.
//
// Each card is a damped pendulum (angle, in degrees) pinned to the rope,
// plus a vertical spring (drop, in px) that lets the rope bounce. Neighbouring
// pins are coupled so a tug on one card ripples along the line.
(function () {
  "use strict";

  var SWING_STIFFNESS = 22;   // pendulum restoring force
  var SWING_DAMPING = 2.8;    // higher = settles faster
  var BREEZE = 11;            // idle sway strength (~0.5° at rest)
  var DROP_STIFFNESS = 90;    // rope bounce
  var DROP_DAMPING = 7;
  var ROPE_COUPLING = 30;     // how much a tug pulls on neighbours
  var BRUSH = 0.028;          // pointer speed (px/s) -> swing impulse (deg/s)
  var MAX_IMPULSE = 45;
  var HOVER_TUG = 35;         // rope dip when the pointer lands on a card
  var FOCUS_NUDGE = 25;       // swing when a card gets keyboard focus
  var ROPE_TOP = 18;          // px from top of the container to the rope ends

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Smooth curve through points (Catmull-Rom converted to cubic Béziers).
  function smoothPath(pts) {
    var d = "M" + pts[0].x + "," + pts[0].y;
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += " C" + (p1.x + (p2.x - p0.x) / 6) + "," + (p1.y + (p2.y - p0.y) / 6) +
           " " + (p2.x - (p3.x - p1.x) / 6) + "," + (p2.y - (p3.y - p1.y) / 6) +
           " " + p2.x + "," + p2.y;
    }
    return d;
  }

  function Clothesline(root) {
    var self = this;
    this.root = root;
    this.svg = root.querySelector(".clothesline-rope");
    this.path = this.svg.querySelector("path");
    this.items = Array.prototype.map.call(root.querySelectorAll(".clothesline-item"), function (el, i) {
      return { el: el, card: el.querySelector(".clothesline-card"), angle: 0, vel: 0, drop: 0, dropVel: 0,
               phase: i * 1.9 + Math.random(), x: 0, y: 0, w: 0, h: 0 };
    });
    this.pointer = null;
    this.running = false;
    this.visible = true;

    root.classList.add("is-live");
    this.layout();

    root.querySelectorAll("img").forEach(function (img) {
      if (!img.complete) img.addEventListener("load", function () { self.layout(); });
    });
    new ResizeObserver(function () { self.layout(); }).observe(root);
    new IntersectionObserver(function (entries) {
      self.visible = entries[0].isIntersecting;
      self.start();
    }).observe(root);

    root.addEventListener("pointermove", function (e) { self.onPointer(e); });
    root.addEventListener("pointerleave", function () { self.pointer = null; });

    this.items.forEach(function (it) {
      it.card.addEventListener("pointerenter", function () { it.dropVel += HOVER_TUG; self.start(); });
      it.card.addEventListener("focus", function () { it.vel += FOCUS_NUDGE; it.dropVel += FOCUS_NUDGE; self.start(); });
      it.card.addEventListener("click", function (e) { Lightbox.open(it.card, clickPoint(it.card, e)); });
    });

    reducedMotion.addEventListener("change", function () { self.render(); self.start(); });
    this.start();
  }

  Clothesline.prototype.layout = function () {
    var W = this.root.clientWidth;
    var n = this.items.length;
    var spacing = W / n;
    var cardW = Math.min(spacing * 0.78, 230);
    this.sag = Math.min(W * 0.05, 34);
    this.width = W;

    var bottom = 0;
    var self = this;
    this.items.forEach(function (it, i) {
      it.el.style.width = cardW + "px";
      it.w = cardW;
      it.h = it.el.offsetHeight;
      it.x = spacing * (i + 0.5);
      var u = it.x / W;
      it.y = ROPE_TOP + self.sag * 4 * u * (1 - u);
      bottom = Math.max(bottom, it.y + it.h);
    });

    var H = bottom + 36;   // room to swing
    this.root.style.height = H + "px";
    this.svg.setAttribute("width", W);
    this.svg.setAttribute("height", H);
    this.render();
  };

  Clothesline.prototype.onPointer = function (e) {
    var rect = this.root.getBoundingClientRect();
    var x = e.clientX - rect.left, y = e.clientY - rect.top, now = e.timeStamp;
    var prev = this.pointer;
    this.pointer = { x: x, y: y, t: now };
    if (!prev || reducedMotion.matches) return;

    var dt = Math.max((now - prev.t) / 1000, 1 / 240);
    var vx = (x - prev.x) / dt;
    this.items.forEach(function (it) {
      var top = it.y + it.drop;
      if (Math.abs(x - it.x) < it.w / 2 && y > top - 12 && y < top + it.h) {
        // Brushing lower on the card swings it harder, like pushing a pendulum.
        var lever = clamp((y - top) / it.h, 0.25, 1);
        it.vel += clamp(-vx * BRUSH * lever, -MAX_IMPULSE, MAX_IMPULSE);
      }
    });
    this.start();
  };

  Clothesline.prototype.step = function (dt, t) {
    var items = this.items;
    items.forEach(function (it, i) {
      var breeze = BREEZE * (Math.sin(t * 0.9 + it.phase) + 0.4 * Math.sin(t * 2.1 + it.phase * 1.3));
      it.vel += (-SWING_STIFFNESS * it.angle - SWING_DAMPING * it.vel + breeze) * dt;
      it.angle += it.vel * dt;

      var left = items[i - 1] ? items[i - 1].drop : 0;
      var right = items[i + 1] ? items[i + 1].drop : 0;
      var pull = ROPE_COUPLING * (left + right - 2 * it.drop);
      it.dropVel += (-DROP_STIFFNESS * it.drop - DROP_DAMPING * it.dropVel + pull) * dt;
      it.drop += it.dropVel * dt;
    });
  };

  Clothesline.prototype.render = function () {
    var pts = [{ x: 0, y: ROPE_TOP }];
    var still = reducedMotion.matches;
    this.items.forEach(function (it, i) {
      var angle = still ? (i % 2 ? 1.5 : -1.5) : it.angle;
      var drop = still ? 0 : it.drop;
      it.el.style.transform = "translate(" + (it.x - it.w / 2) + "px," + (it.y + drop) + "px) rotate(" + angle + "deg)";
      pts.push({ x: it.x, y: it.y + drop });
    });
    pts.push({ x: this.width, y: ROPE_TOP });
    this.path.setAttribute("d", smoothPath(pts));
  };

  Clothesline.prototype.start = function () {
    if (this.running || !this.visible || reducedMotion.matches) return;
    this.running = true;
    var self = this, last = performance.now();
    function frame(now) {
      if (!self.visible || reducedMotion.matches) { self.running = false; return; }
      var dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      // Two half-steps keep the springs stable at low frame rates.
      self.step(dt / 2, now / 1000);
      self.step(dt / 2, now / 1000);
      self.render();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  // Where a click landed on the card's picture, as fractions (null for keyboard clicks).
  function clickPoint(card, e) {
    if (!e.detail) return null;
    var r = card.querySelector("img").getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  }

  // One shared lightbox for every clothesline on the page.
  // The picture washes in like watercolor when assets/js/watercolor-wash.js
  // can run (WebGL2, motion allowed); otherwise the CSS fade plays.
  var Lightbox = {
    open: function (card, origin, freeze) {
      if (!this.dialog) this.build();
      var img = card.querySelector("img");
      this.img.src = img.currentSrc || img.src;
      this.img.alt = img.alt;
      this.caption.textContent = card.dataset.caption;
      this.returnFocus = card;
      if (window.WatercolorWash) WatercolorWash.prepare(this.dialog, this.img, origin, freeze);
      this.dialog.showModal();
    },
    build: function () {
      var d = document.createElement("dialog");
      d.className = "lightbox";
      d.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure>' +
                    '<button type="button" class="lightbox-close" aria-label="Close">×</button>';
      document.body.appendChild(d);
      this.dialog = d;
      this.img = d.querySelector("img");
      this.caption = d.querySelector("figcaption");
      var self = this;
      d.addEventListener("click", function (e) {
        if (e.target === d || e.target.closest(".lightbox-close")) d.close();
      });
      d.addEventListener("close", function () { if (self.returnFocus) self.returnFocus.focus({ preventScroll: true }); });
    }
  };

  document.querySelectorAll("[data-clothesline]").forEach(function (root) { new Clothesline(root); });

  // Test hook: #wash-test=N opens the Nth card (1-based); #wash-test=N@0.4
  // holds the wash at 40% so a headless browser can screenshot it, and
  // #wash-test=N@0.4@0.1,0.9 starts it from that point of the picture.
  var test = location.hash.match(/^#wash-test=(\d+)(?:@([\d.]+))?(?:@([\d.]+),([\d.]+))?$/);
  var cards = document.querySelectorAll(".clothesline-card");
  if (test && cards[test[1] - 1]) {
    Lightbox.open(cards[test[1] - 1], test[3] ? { x: +test[3], y: +test[4] } : null,
                  test[2] ? parseFloat(test[2]) : null);
  }
})();
