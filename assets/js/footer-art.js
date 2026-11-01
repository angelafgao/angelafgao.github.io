// Footer animation: a quiet strip of motion above the footer on every page.
// This file has the engine plus Ripples; the other animations live in
// footer-art-extras.js and are only loaded when needed.
//
// The mode comes from _config.yml (footer_animation). In development the font
// lab can switch it live via window.FooterArt.setMode(). The animation pauses
// when scrolled off-screen and is drawn as a still frame for visitors who
// prefer reduced motion.
//
// Each renderer implements update(dt) and draw(ctx), plus optional
// resize(), pointer(x, y) (null when the pointer leaves) and poke(x, y).
(function () {
  "use strict";

  var root = document.querySelector(".footer-art");
  if (!root) return;

  var canvas = root.querySelector("canvas");
  var ctx = canvas.getContext("2d");
  var styles = getComputedStyle(document.documentElement);
  var INK = styles.getPropertyValue("--color-text").trim() || "#6b1a2a";
  var MUTED = styles.getPropertyValue("--color-muted").trim() || "#8a4b56";
  var PAPER = styles.getPropertyValue("--color-bg").trim() || "#f3f0e9";
  var UI_FONT = styles.getPropertyValue("--font-ui").trim() || "monospace";
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Used by the "per-page" mode.
  var PAGE_MODES = {
    "/": "seismograph",
    "/Research/": "ripples",
    "/about/": "bird",
    "/Publications/": "ink",
    "/news/": "ticker"
  };

  var W = 0, H = 0, renderer = null, visible = true, running = false;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---------------------------------------------------------------------------
  // 2. Ripples: wavefronts expand through a hidden velocity field. Each front is
  //    a ring of rays that bend toward slower regions (Snell's law).
  // ---------------------------------------------------------------------------
  function Ripples() {
    var BASE = 42, rings = [], nextAuto = 0.4, last = null;
    var field = document.createElement("canvas");

    function vel(x, y) {
      return 1 + 0.35 * Math.sin(x * 0.011 + 1.3) * Math.cos(y * 0.05) +
             0.25 * Math.sin(x * 0.0037 - y * 0.03 + 2);
    }

    function spawn(x, y, strength) {
      var pts = [], N = 160;
      for (var i = 0; i < N; i++) {
        var a = (i / N) * Math.PI * 2;
        pts.push({ x: x, y: y, dx: Math.cos(a), dy: Math.sin(a) });
      }
      rings.push({ pts: pts, age: 0, life: 3 + strength * 2.5, strength: strength });
      if (rings.length > 14) rings.shift();
    }

    // Faint dots hint at the velocity field: denser ink where waves travel slower.
    this.resize = function () {
      var dpr = window.devicePixelRatio || 1;
      field.width = Math.round(W * dpr);
      field.height = Math.round(H * dpr);
      var f = field.getContext("2d");
      f.setTransform(dpr, 0, 0, dpr, 0, 0);
      f.fillStyle = INK;
      for (var y = 8; y < H; y += 14) for (var x = 7; x < W; x += 14) {
        f.globalAlpha = clamp((1.3 - vel(x, y)) * 0.45, 0.03, 0.3);
        f.fillRect(x, y, 1.2, 1.2);
      }
    };

    this.poke = function (x, y) { spawn(x, y, 1); };
    this.pointer = function (x, y) {
      if (x == null) { last = null; return; }
      if (!last || Math.hypot(x - last.x, y - last.y) > 70) { spawn(x, y, 0.35); last = { x: x, y: y }; }
    };

    this.update = function (dt) {
      nextAuto -= dt;
      if (nextAuto <= 0) { spawn(rand(0.1, 0.9) * W, rand(0.3, 0.7) * H, 0.7); nextAuto = rand(2.2, 4); }
      rings.forEach(function (r) {
        r.age += dt;
        r.pts.forEach(function (p) {
          var v = vel(p.x, p.y), ds = v * BASE * dt;
          var gx = (vel(p.x + 1, p.y) - vel(p.x - 1, p.y)) / 2;
          var gy = (vel(p.x, p.y + 1) - vel(p.x, p.y - 1)) / 2;
          var along = gx * p.dx + gy * p.dy;
          p.dx -= ((gx - along * p.dx) / v) * ds;
          p.dy -= ((gy - along * p.dy) / v) * ds;
          var len = Math.hypot(p.dx, p.dy);
          p.dx /= len; p.dy /= len;
          p.x += p.dx * ds; p.y += p.dy * ds;
        });
      });
      rings = rings.filter(function (r) { return r.age < r.life; });
    };

    this.draw = function (ctx) {
      if (field.width) ctx.drawImage(field, 0, 0, W, H);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      rings.forEach(function (r) {
        var k = 1 - r.age / r.life;
        ctx.globalAlpha = 0.85 * k * k * (0.45 + r.strength * 0.55);
        // Smooth curve through the ray tips (quadratics between midpoints)
        var pts = r.pts, n = pts.length;
        ctx.beginPath();
        ctx.moveTo((pts[n - 1].x + pts[0].x) / 2, (pts[n - 1].y + pts[0].y) / 2);
        for (var i = 0; i < n; i++) {
          var a = pts[i], b = pts[(i + 1) % n];
          ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    };
  }


  // ---------------------------------------------------------------------------

  // Ripples ships with every page; the rest come from footer-art-extras.js when loaded.
  var env = { W: 0, H: 0, INK: INK, MUTED: MUTED, PAPER: PAPER, UI_FONT: UI_FONT, rand: rand, clamp: clamp };
  var RENDERERS = { ripples: Ripples };
  if (window.FooterArtExtras) {
    var extras = window.FooterArtExtras(env);
    Object.keys(extras).forEach(function (name) { RENDERERS[name] = extras[name]; });
  }

  function resolve(mode) {
    if (mode === "per-page") mode = PAGE_MODES[location.pathname] || "ripples";
    return RENDERERS[mode] ? mode : "ripples";
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    renderer.draw(ctx);
  }

  function resize() {
    var rect = root.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    W = env.W = rect.width;
    H = env.H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (renderer) { renderer.resize(); if (!running) draw(); }
  }

  function start() {
    if (running || !visible || reducedMotion.matches) return;
    running = true;
    var last = performance.now();
    requestAnimationFrame(function frame(now) {
      if (!visible || reducedMotion.matches) { running = false; return; }
      var dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      renderer.update(dt);
      draw();
      requestAnimationFrame(frame);
    });
  }

  function setMode(mode) {
    var name = resolve(mode);
    renderer = new RENDERERS[name]();
    root.dataset.active = name;
    resize();
    if (reducedMotion.matches) {
      // Simulate a few seconds, then hold that frame.
      for (var i = 0; i < 300; i++) renderer.update(1 / 60);
      draw();
    } else {
      start();
    }
  }

  function local(e) {
    var rect = root.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }
  root.addEventListener("pointermove", function (e) { if (renderer.pointer) renderer.pointer.apply(renderer, local(e)); });
  root.addEventListener("pointerleave", function () { if (renderer.pointer) renderer.pointer(null, null); });
  root.addEventListener("pointerdown", function (e) { if (renderer.poke) renderer.poke.apply(renderer, local(e)); });

  new ResizeObserver(resize).observe(root);
  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    start();
  }).observe(root);
  reducedMotion.addEventListener("change", function () { setMode(root.dataset.mode); });

  // Development only: ?footer=ripples (or the font lab's saved choice) overrides the config.
  var override = root.dataset.dev === "true" &&
    (new URLSearchParams(location.search).get("footer") || localStorage.getItem("footer-art-mode"));
  if (override) root.dataset.mode = override;
  setMode(root.dataset.mode);

  window.FooterArt = {
    modes: Object.keys(RENDERERS).concat(window.FooterArtExtras ? ["per-page"] : []),
    setMode: function (mode) { root.dataset.mode = mode; setMode(mode); }
  };
})();
