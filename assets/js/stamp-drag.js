// Movable stamps: a stamp included with movable="true" can be picked up and
// set down anywhere in the page's content column, with a mouse, a finger, a
// pen or the keyboard, and the text under it makes way (stamp-flow.js).
//
// Until it's first moved, a stamp sits where the page puts it (on News, a
// float the text wraps around). Picking it up lifts it a little; the first
// time, the flow module and Pretext are fetched, and once they're in, the
// stamp swaps its float for absolute positioning and the text flows around it
// instead, in the same frame. Setting it down stamps it again (stamps.js).
// Where it was left is remembered per page; a double-click (or double-tap, or
// Home on the keyboard) puts it back.
//
// Keys, once the stamp has focus: arrows move it, Shift+arrows further;
// Enter or Space stamps it again; Home puts it back.
//
// If the flow module can't load, the stamp still moves and simply lies on
// top of the text.
(function () {
  "use strict";

  var src = document.currentScript && document.currentScript.src;
  if (!src || !window.PointerEvent || !window.Map || !window.Set) return;

  var STEP = 8, BIG_STEP = 48;   // keyboard nudges, px
  var SLOP = 4;                  // px a press may wander and still be a click
  var KEY_DROP_MS = 700;         // after the last nudge the stamp is set down
  var TAP_MS = 350;              // double-tap window
  var MARGIN = 10;               // text keeps this far from the ink, px
  var STORE = "stamp-pos:";

  var stamps = Array.prototype.slice.call(document.querySelectorAll("svg.stamp[data-stamp-movable]"));
  if (!stamps.length) return;

  var root = document.documentElement;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mod, loading = null;       // the flow module, once imported (null: failed)
  var fields = new Map();        // content column -> { flow, stamps }
  var raf = 0, said, hint;
  var costs = [];                // last frames' reflow times, ms (for tuning)

  function load() {
    if (!loading) {
      loading = Promise.all([
        import(new URL("stamp-flow.js", src).href),
        document.fonts ? document.fonts.ready : null
      ]).then(function (m) {
        mod = m[0];
        try { mod.warm(getComputedStyle(document.body).font); } catch (err) { /* only a head start */ }
        return mod;
      }, function () {
        mod = null;   // no reflow: stamps just lie on the text
        return null;
      });
    }
    return loading;
  }

  function store(key, value) {
    try {
      if (value) localStorage.setItem(key, JSON.stringify(value));
      else localStorage.removeItem(key);
    } catch (err) { /* private mode: just don't remember */ }
  }
  function recall(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (err) { return null; }
  }

  // Polite announcements for screen readers.
  function announce(text) {
    if (!said) {
      said = document.createElement("span");
      said.className = "visually-hidden";
      said.setAttribute("aria-live", "polite");
      document.body.appendChild(said);
    }
    said.textContent = text;
  }

  // ---------------------------------------------------------------------------
  // Reflow: every placed stamp in a column is an obstacle for its text.
  // ---------------------------------------------------------------------------
  function field(col) {
    var f = fields.get(col);
    if (!f) { f = { flow: null, stamps: [] }; fields.set(col, f); }
    return f;
  }

  function reflow(f) {
    if (!mod) return;
    var t0 = performance.now(), shapes = [];
    for (var i = 0; i < f.stamps.length; i++) {
      if (f.stamps[i].placed) shapes.push(f.stamps[i].shape());
    }
    if (!f.flow) {
      if (!shapes.length) return;
      f.flow = mod.createFlow(f.stamps[0].col);
    }
    try {
      if (shapes.length) { f.flow.update(shapes); f.flow.prime(); } else f.flow.restoreAll();
    } catch (err) {
      try { f.flow.restoreAll(); } catch (e) { /* leave it */ }
    }
    costs.push(performance.now() - t0);
    if (costs.length > 240) costs.shift();
  }
  function reflowAll() { raf = 0; fields.forEach(reflow); }
  function schedule() { if (!raf) raf = requestAnimationFrame(reflowAll); }

  function invalidate() {
    fields.forEach(function (f) {
      if (f.flow) f.flow.invalidate();
      f.stamps.forEach(function (s) { if (s.placed) s.refit(); });
    });
    schedule();
  }

  // ---------------------------------------------------------------------------
  // One movable stamp
  // ---------------------------------------------------------------------------
  function Movable(svg, index) {
    var self = this;
    this.svg = svg;
    this.holder = svg.closest("[data-stamp-holder]") || svg;
    this.col = this.holder.closest(".page-content") || this.holder.closest("main") || this.holder.parentElement;
    this.key = STORE + location.pathname + "#" + index;
    this.placed = false;
    this.pos = null;        // holder's top left in the column, px (padding box)
    this.home = null;       // ...where the page first put it
    this.fx = 0;            // pos.x as a share of the room across, kept for resizes
    this.drag = null;
    this.held = false;
    this.keyTimer = 0;
    this.lastTap = null;
    this.eatClick = false;
    this.gap = null;        // the space it left in the page, closing
    field(this.col).stamps.push(this);

    svg.classList.add("is-movable");
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("aria-roledescription", "movable stamp");
    svg.setAttribute("aria-describedby", hint.id);
    var title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = "Drag to move · double-click to put back";
    svg.insertBefore(title, svg.firstChild);

    svg.addEventListener("pointerdown", function (e) { self.down(e); });
    svg.addEventListener("pointermove", function (e) { self.moveTo(e); });
    svg.addEventListener("pointerup", function (e) { self.up(e, false); });
    svg.addEventListener("pointercancel", function (e) { self.up(e, true); });
    svg.addEventListener("keydown", function (e) { self.key_(e); });
    svg.addEventListener("blur", function () { if (self.held && !self.drag) self.drop(); });
    // A press that turned into a drag isn't a click (stamps.js re-stamps on
    // click). Capture listeners on the target run first.
    svg.addEventListener("click", function (e) {
      if (self.eatClick) { self.eatClick = false; e.stopImmediatePropagation(); }
    }, true);

    // Left somewhere last time: put it straight back there, unseen until the
    // text can make way for it.
    var saved = recall(this.key);
    if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
      this.measureHome();
      this.holder.classList.add("is-pending");
      this.fx = Math.max(0, Math.min(1, saved.x));
      this.place({ x: this.fx * this.room().x, y: saved.y });
      load().then(function () {
        self.refit();
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        reflowAll();
        self.holder.classList.remove("is-pending");
      });
    }
  }

  var M = Movable.prototype;

  // The column's padding box, in the viewport.
  M.origin = function () {
    var r = this.col.getBoundingClientRect();
    return { x: r.left + this.col.clientLeft, y: r.top + this.col.clientTop };
  };

  M.size = function () {
    var h = this.holder;
    if (h.offsetWidth !== undefined) return { w: h.offsetWidth, h: h.offsetHeight };
    var cs = getComputedStyle(h);
    return { w: parseFloat(cs.width) || 0, h: parseFloat(cs.height) || 0 };
  };

  // How far it can go: the column, less its own size.
  M.room = function () {
    var s = this.size();
    return { x: Math.max(0, this.col.clientWidth - s.w), y: Math.max(0, this.col.clientHeight - s.h) };
  };

  M.clamp = function (p) {
    var room = this.room();
    return { x: Math.max(0, Math.min(room.x, p.x)), y: Math.max(0, Math.min(room.y, p.y)) };
  };

  // Where the page put it (only while it's still there).
  M.measureHome = function () {
    if (this.placed) return;
    var r = this.holder.getBoundingClientRect(), o = this.origin();
    var t = this.holder.style.translate;
    this.holder.style.translate = "";
    if (t) r = this.holder.getBoundingClientRect();
    this.holder.style.translate = t;
    this.home = { x: r.left - o.x, y: r.top - o.y };
    // Not yet on its way: it's at home (which may have moved with the page).
    if (!this.pos || !this.held) this.pos = { x: this.home.x, y: this.home.y };
  };

  // Show pos: absolutely positioned once placed; before that (Pretext still
  // on its way) nudged from home with a translate, so nothing else moves yet.
  M.apply = function () {
    var h = this.holder, p = this.pos;
    if (this.placed) {
      h.style.left = p.x + "px";
      h.style.top = p.y + "px";
    } else if (this.home) {
      h.style.translate = (p.x - this.home.x) + "px " + (p.y - this.home.y) + "px";
    }
  };

  M.setPos = function (p) {
    this.pos = this.clamp(p);
    var room = this.room();
    this.fx = room.x ? this.pos.x / room.x : 0;
    this.apply();
    if (this.placed) schedule();
  };

  // Take it out of the page's flow and let the text flow around it instead.
  // If it had a line of its own (News on a phone), a gap holds that space and
  // closes up once it's on its way, rather than everything jumping.
  M.place = function (p) {
    if (!this.placed) {
      var cs = getComputedStyle(this.holder);
      if (this.held && cs.float === "none" && cs.position === "static" && cs.display !== "inline") {
        var gap = document.createElement("div");
        gap.className = "stamp-gap";
        gap.setAttribute("aria-hidden", "true");
        gap.style.height = this.holder.offsetHeight + "px";
        gap.style.marginTop = cs.marginTop;
        gap.style.marginBottom = cs.marginBottom;
        this.holder.parentNode.insertBefore(gap, this.holder);
        this.gap = gap;
      }
      this.col.classList.add("stamp-field");
      this.holder.style.translate = "";
      this.holder.classList.add("is-placed");
      this.placed = true;
    }
    this.setPos(p || this.pos);
    // Same frame: the float's wrap is replaced by the reflow before paint.
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    reflowAll();
  };

  // The window or fonts changed: same share across, still inside the column.
  M.refit = function () {
    var room = this.room();
    this.setPos({ x: this.fx * room.x, y: this.pos.y });
  };

  // The ink's footprint as a convex polygon in viewport px, turned with the
  // stamp, MARGIN out from the outer ring.
  M.shape = function () {
    var svg = this.svg, vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect();
    var w = parseFloat(getComputedStyle(svg).width) || r.width, k = w / (vb.width || w);
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var a = (parseFloat(svg.style.getPropertyValue("--tilt")) || 0) * Math.PI / 180;
    var cos = Math.cos(a), sin = Math.sin(a), pts = [], i, t;
    var ring = svg.querySelector(".stamp-inked ellipse, .stamp-inked rect");
    var sw = ring ? (parseFloat(ring.getAttribute("stroke-width")) || 0) / 2 : 0;
    function attr(n, d) { var v = ring ? parseFloat(ring.getAttribute(n)) : NaN; return isNaN(v) ? d : v; }
    if (ring && ring.tagName === "rect") {
      // Rounded rectangle: the frame grown by the margin, corners rounded.
      var x = attr("x", 0), y = attr("y", 0);
      var hw = (attr("width", vb.width) / 2 + sw) * k, hh = (attr("height", vb.height) / 2 + sw) * k;
      var ox = (x + attr("width", vb.width) / 2 - vb.width / 2) * k, oy = (y + attr("height", vb.height) / 2 - vb.height / 2) * k;
      var corners = [[hw, hh, 0], [-hw, hh, 1], [-hw, -hh, 2], [hw, -hh, 3]];
      for (i = 0; i < 4; i++) {
        for (var j = 0; j <= 4; j++) {
          t = (corners[i][2] + j / 4) * Math.PI / 2;
          pts.push([ox + corners[i][0] + MARGIN * Math.cos(t), oy + corners[i][1] + MARGIN * Math.sin(t)]);
        }
      }
    } else {
      var rx = (attr("rx", vb.width / 2) + sw) * k + MARGIN, ry = (attr("ry", vb.height / 2) + sw) * k + MARGIN;
      var ex = (attr("cx", vb.width / 2) - vb.width / 2) * k, ey = (attr("cy", vb.height / 2) - vb.height / 2) * k;
      for (i = 0; i < 36; i++) {
        t = (i / 36) * 2 * Math.PI;
        pts.push([ex + rx * Math.cos(t), ey + ry * Math.sin(t)]);
      }
    }
    var l = Infinity, top = Infinity, rt = -Infinity, b = -Infinity;
    var poly = pts.map(function (p) {
      var q = [cx + p[0] * cos - p[1] * sin, cy + p[0] * sin + p[1] * cos];
      if (q[0] < l) l = q[0];
      if (q[0] > rt) rt = q[0];
      if (q[1] < top) top = q[1];
      if (q[1] > b) b = q[1];
      return q;
    });
    return { poly: poly, l: l, t: top, r: rt, b: b };
  };

  // ---------------------------------------------------------------------------
  // Picking up and setting down
  // ---------------------------------------------------------------------------
  M.lift = function () {
    var self = this;
    this.measureHome();
    this.held = true;
    this.svg.classList.remove("is-thunk");
    this.svg.classList.add("is-held");
    load().then(function () {
      // Pretext is in (or isn't coming): take it out of the float now.
      if (!self.placed && (self.held || self.moved())) self.place();
    });
  };

  M.moved = function () {
    return this.home && this.pos && (this.pos.x !== this.home.x || this.pos.y !== this.home.y);
  };

  // Close the gap it left (animated: the column's ResizeObserver re-flows
  // the text as it goes).
  M.closeGap = function () {
    var gap = this.gap;
    if (!gap || gap.classList.contains("is-closing")) return;
    var self = this;
    void gap.offsetHeight;
    gap.classList.add("is-closing");
    setTimeout(function () {
      gap.remove();
      if (self.gap === gap) self.gap = null;
    }, 400);
  };

  M.drop = function () {
    clearTimeout(this.keyTimer);
    this.closeGap();
    this.held = false;
    this.svg.classList.remove("is-held");
    root.classList.remove("stamp-dragging");
    if (window.Stamps) window.Stamps.restamp(this.svg);
    if (this.placed || mod !== undefined) {
      store(this.key, { x: +this.fx.toFixed(4), y: Math.round(this.pos.y) });
    } else {
      // Set down before the flow module answered: remember it once placed.
      var self = this;
      load().then(function () {
        store(self.key, { x: +self.fx.toFixed(4), y: Math.round(self.pos.y) });
      });
    }
    schedule();   // the new impression is turned a little differently
    var room = this.room();
    announce("Stamp set down, " + Math.round(this.fx * 100) + "% across and " +
      Math.round(room.y ? (this.pos.y / room.y) * 100 : 0) + "% down.");
  };

  // Back where the page put it, text and all.
  M.reset = function () {
    clearTimeout(this.keyTimer);
    store(this.key, null);
    this.held = false;
    this.svg.classList.remove("is-held");
    if (!this.placed && !this.moved()) return;
    var h = this.holder;
    if (this.gap) { this.gap.remove(); this.gap = null; }
    h.classList.remove("is-placed");
    h.style.left = h.style.top = h.style.translate = "";
    this.placed = false;
    this.pos = this.home ? { x: this.home.x, y: this.home.y } : null;
    var f = field(this.col);
    if (!f.stamps.some(function (s) { return s.placed; })) this.col.classList.remove("stamp-field");
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    reflowAll();
    if (window.Stamps) window.Stamps.restamp(this.svg);
    announce("Stamp put back.");
  };

  M.down = function (e) {
    if (e.button !== 0 || !e.isPrimary || this.drag) return;
    e.preventDefault();   // no text selection or image drag; click still fires
    this.eatClick = false;
    try { this.svg.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    this.measureHome();
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: { x: this.pos.x, y: this.pos.y }, moved: false };
    load();   // first pickup: start fetching while the press decides
  };

  M.moveTo = function (e) {
    var d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    var dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved) {
      if (dx * dx + dy * dy < SLOP * SLOP) return;
      d.moved = true;
      root.classList.add("stamp-dragging");
      this.lift();
    }
    this.setPos({ x: d.from.x + dx, y: d.from.y + dy });
    if (this.placed && !reducedMotion.matches) this.closeGap();
  };

  M.up = function (e, cancelled) {
    var d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (d.moved) {
      this.eatClick = true;
      this.lastTap = null;
      this.drop();
      return;
    }
    if (cancelled) return;
    // Two taps in quick succession: put it back.
    var now = performance.now(), last = this.lastTap;
    if (last && now - last.t < TAP_MS && Math.abs(e.clientX - last.x) < 24 && Math.abs(e.clientY - last.y) < 24) {
      this.lastTap = null;
      if (this.placed || this.moved()) {
        this.eatClick = true;   // reset() stamps it itself
        this.reset();
      }
      return;
    }
    this.lastTap = { t: now, x: e.clientX, y: e.clientY };
  };

  M.key_ = function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var step = e.shiftKey ? BIG_STEP : STEP, dx = 0, dy = 0;
    switch (e.key) {
      case "ArrowLeft": dx = -step; break;
      case "ArrowRight": dx = step; break;
      case "ArrowUp": dy = -step; break;
      case "ArrowDown": dy = step; break;
      case "Home": e.preventDefault(); this.reset(); return;
      case "Enter": case " ":
        e.preventDefault();
        if (window.Stamps) window.Stamps.restamp(this.svg);
        return;
      default: return;
    }
    e.preventDefault();
    if (!this.held) this.lift();
    if (!this.pos) this.measureHome();
    this.setPos({ x: this.pos.x + dx, y: this.pos.y + dy });
    var self = this;
    clearTimeout(this.keyTimer);
    this.keyTimer = setTimeout(function () { if (self.held) self.drop(); }, KEY_DROP_MS);
  };

  // ---------------------------------------------------------------------------
  hint = document.createElement("span");
  hint.id = "stamp-move-hint";
  hint.className = "visually-hidden";
  hint.textContent = "Drag it, or use the arrow keys to move it (Shift for bigger steps). " +
    "Enter stamps it again; Home or a double-click puts it back.";
  document.body.appendChild(hint);

  stamps.forEach(function (svg, i) { new Movable(svg, i); });

  window.addEventListener("resize", invalidate);
  if (document.fonts) document.fonts.addEventListener("loadingdone", invalidate);
  // The dev font lab restyles <html> live.
  new MutationObserver(invalidate).observe(root, { attributes: true, attributeFilter: ["style"] });
  // Anything else that moves the text under a placed stamp (images loading).
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(schedule);
    fields.forEach(function (f, col) { ro.observe(col); });
  }

  if (window.Stamps) window.Stamps.flowCosts = costs;
})();
