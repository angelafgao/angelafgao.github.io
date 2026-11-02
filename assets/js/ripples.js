// Page ripples: click the page (anywhere that isn't a link, button or other
// control) and a ring of water spreads out from the click, bending the text
// and images beneath it, then settles back to the crisp page in ~1.5 s.
// Clicks in quick succession superpose.
//
// How it works (HTML-in-Canvas + WebGL2): while ripples are alive, a
// viewport-sized <canvas content="drawable"> covers the page. Inside it sits
// a clone of .page, shifted to the current scroll position and clipped to the
// viewport, so the browser only ever rasterises what is on screen. Each
// "paint" event copies that clone into a texture (texElementSubImage2D), and
// a fragment shader samples it through a sum of damped radial wave packets.
//
// Why a clone, rather than moving the real .page into the canvas: moving it
// would collapse the document height (losing the scroll position), drop focus
// and selection, restart CSS animations such as the illuminated initial, and
// re-fire every observer on the page. The clone leaves the real DOM alone.
// The overlay ignores the pointer, so clicks, hovers and scrolling still go
// straight to the real page, and once the last ripple dies the overlay is
// removed and nothing of it remains.
//
// Browsers without HTML-in-Canvas or WebGL2 get a thin maroon ring instead.
// Visitors who prefer reduced motion get nothing, and ripples stay off while
// the "eht" easter egg (lensing.js) is bending the page.
(function () {
  "use strict";

  var SPEED = 440;         // wavefront speed, px/s
  var LIFE = 1.5;          // seconds until a ripple has fully settled
  var WAVELENGTH = 44;     // px between crests
  var PACKET = 46;         // half-width of the ring of waves, px
  var AMPLITUDE = 3.5;     // largest displacement, px (x 2π/WAVELENGTH stays well under 1: no folding)
  var MAX_RIPPLES = 8;     // must match the shader's array size
  var FADE_MS = 140;       // overlay cross-fade at the start and end

  // Clicks on these never ripple: they already do something.
  var IGNORE = "a, button, input, select, textarea, label, summary, video, audio, " +
               "[contenteditable], [role=button], [tabindex], dialog, " +
               ".font-lab, .clothesline, .footer-art, .eht-hole";

  var page = document.querySelector(".page");
  if (!page) return;

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var docEl = document.documentElement;

  function ehtOn() { return docEl.classList.contains("eht-on"); }

  // ---------------------------------------------------------------------------
  // Fallback: a thin maroon ring (no distortion), drawn with CSS.
  // ---------------------------------------------------------------------------
  function ring(x, y) {
    [0, 0.14].forEach(function (delay) {
      var el = document.createElement("div");
      el.className = "page-ripple-ring";
      el.setAttribute("aria-hidden", "true");
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.animationDelay = delay + "s";
      el.addEventListener("animationend", function () { el.remove(); });
      document.body.appendChild(el);
    });
  }

  // ---------------------------------------------------------------------------
  // Refraction: HTML-in-Canvas + WebGL2.
  // ---------------------------------------------------------------------------
  function supported() {
    var c = document.createElement("canvas");
    c.setAttribute("content", "drawable");
    return c.content === "drawable" && "requestPaint" in c && !!window.WebGL2RenderingContext;
  }

  var VERTEX = [
    "#version 300 es",
    "void main() {",
    "  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);",   // one big triangle
    "  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);",
    "}"
  ].join("\n");

  var FRAGMENT = [
    "#version 300 es",
    "precision highp float;",
    "uniform sampler2D page;",
    "uniform vec2 res;",               // canvas size, device px
    "uniform vec2 size;",              // canvas size, CSS px
    "uniform vec4 ripples[" + MAX_RIPPLES + "];",  // x, y (CSS px), age (s), strength
    "uniform int count;",
    "uniform vec3 ink;",
    "uniform vec3 light;",
    "out vec4 color;",
    "const float SPEED = " + SPEED.toFixed(1) + ";",
    "const float LIFE = " + LIFE.toFixed(2) + ";",
    "const float K = " + (2 * Math.PI / WAVELENGTH).toFixed(5) + ";",
    "const float PACKET = " + PACKET.toFixed(1) + ";",
    "const float AMPLITUDE = " + AMPLITUDE.toFixed(1) + ";",
    "void main() {",
    "  vec2 uv = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y) / res;",  // texture row 0 is the top
    "  vec2 p = uv * size;",
    "  vec2 shift = vec2(0.0);",
    "  float focus = 0.0;",
    "  for (int i = 0; i < " + MAX_RIPPLES + "; i++) {",
    "    if (i >= count) break;",
    "    vec4 r = ripples[i];",
    "    vec2 d = p - r.xy;",
    "    float dist = length(d);",
    "    float front = SPEED * r.z;",
    "    float x = dist - front;",                              // distance behind the wavefront
    "    float packet = exp(-x * x / (PACKET * PACKET));",
    "    float settle = 1.0 - r.z / LIFE;",
    "    float amp = r.w * AMPLITUDE * settle * (2.0 - settle) / (1.0 + front / 900.0);",  // damps to 0 at LIFE
    "    amp *= smoothstep(0.0, 24.0, dist);",                   // calm at the very centre
    "    shift += (d / max(dist, 1e-3)) * amp * packet * sin(K * x);",
    "    focus += amp * packet * cos(K * x);",
    "  }",
    "  color = texture(page, uv - shift / size);",
    // A faint caustic: crests catch a cream highlight, troughs a maroon shade.
    "  float f = clamp(focus / AMPLITUDE, -1.0, 1.0);",
    "  color.rgb = mix(color.rgb, f > 0.0 ? light : ink, abs(f) * 0.05);",
    "}"
  ].join("\n");

  function Refractor() {
    var self = this;
    var styles = getComputedStyle(docEl);
    var canvas = document.createElement("canvas");
    canvas.className = "page-ripples";
    canvas.setAttribute("content", "drawable");
    canvas.setAttribute("aria-hidden", "true");
    canvas.inert = true;
    var view = document.createElement("div");     // the viewport: clips the clone
    view.className = "page-ripples-view";
    canvas.appendChild(view);

    var gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error("no webgl2");
    var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    var u = {};
    ["page", "res", "size", "ripples", "count", "ink", "light"].forEach(function (name) {
      u[name] = gl.getUniformLocation(program, name);
    });
    gl.uniform1i(u.page, 0);
    gl.uniform3fv(u.ink, rgb(styles.getPropertyValue("--color-text").trim() || "#6b1a2a"));
    gl.uniform3fv(u.light, [1, 0.995, 0.975]);

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    var ripples = [], clone = null, canvases = [], state = "idle";
    var cssW = 0, cssH = 0, texW = 0, texH = 0, raf = 0, uploaded = false;
    var data = new Float32Array(MAX_RIPPLES * 4);

    this.broken = false;
    this.hold = null;      // testing: freeze every ripple at this age (s)
    canvas.addEventListener("webglcontextlost", function () { self.broken = true; self.stop(); });

    // Size the canvas to the viewport (minus any scrollbar), in exact device pixels.
    function size() {
      cssW = docEl.clientWidth;
      cssH = docEl.clientHeight;
      var dpr = window.devicePixelRatio || 1;
      canvas.style.width = view.style.width = cssW + "px";
      canvas.style.height = view.style.height = cssH + "px";
      texW = Math.round(cssW * dpr);
      texH = Math.round(cssH * dpr);
      return texW <= maxTex && texH <= maxTex;
    }
    new ResizeObserver(function (entries) {
      var box = entries[0].devicePixelContentBoxSize;
      if (!box || state === "idle") return;
      var w = box[0].inlineSize, h = box[0].blockSize;
      if (w !== texW || h !== texH) { texW = w; texH = h; allocate(); }
    }).observe(canvas);

    function allocate() {
      canvas.width = texW;
      canvas.height = texH;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, texW, texH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      uploaded = false;
      canvas.requestPaint();
    }

    // Line the clone up with the real page, wherever it has scrolled to.
    function align() {
      var rect = page.getBoundingClientRect();
      clone.style.width = rect.width + "px";
      clone.style.transform = "translate(" + rect.left + "px," + rect.top + "px)";
    }

    function snapshot() {
      clone = page.cloneNode(true);
      clone.classList.add("page-ripples-clone");
      view.style.background = getComputedStyle(document.body).backgroundColor;
      view.appendChild(clone);
      align();

      // Canvases (the footer animation) clone blank: copy their pixels in.
      var from = page.querySelectorAll("canvas"), to = clone.querySelectorAll("canvas");
      canvases = [];
      for (var i = 0; i < from.length; i++) {
        to[i].width = from[i].width;
        to[i].height = from[i].height;
        canvases.push([from[i], to[i]]);
      }
      copyCanvases();

      // Cloned CSS animations would restart: pick them up where the originals are.
      var originals = page.querySelectorAll("*"), copies = clone.querySelectorAll("*"), index = new Map();
      for (var j = 0; j < originals.length; j++) index.set(originals[j], copies[j]);
      document.getAnimations().forEach(function (a) {
        var target = a.effect && index.get(a.effect.target);
        if (!target || !a.animationName) return;
        target.getAnimations().forEach(function (b) {
          if (b.animationName === a.animationName && b.effect.pseudoElement === a.effect.pseudoElement) {
            if (a.playState === "finished") { b.finish(); return; }
            if (a.playState === "paused") b.pause();
            b.currentTime = a.currentTime;
          }
        });
      });

      // Wait (briefly) for cloned images to decode so none flash in blank.
      var decoding = Array.prototype.map.call(clone.querySelectorAll("img"), function (img) {
        return img.complete ? img.decode().catch(function () {}) : null;
      });
      return Promise.race([Promise.all(decoding), new Promise(function (r) { setTimeout(r, 300); })]);
    }

    function copyCanvases() {
      canvases.forEach(function (pair) {
        var r = pair[0].getBoundingClientRect();
        if (r.bottom < 0 || r.top > cssH || !pair[0].width) return;   // off screen
        var c = pair[1].getContext("2d");
        c.clearRect(0, 0, pair[1].width, pair[1].height);
        c.drawImage(pair[0], 0, 0);
      });
    }

    // The browser has (re)painted the clone: copy it into the texture.
    canvas.addEventListener("paint", function () {
      if (state === "idle" || !texW) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, view);
      uploaded = true;
      if (state === "priming") {
        state = "live";
        var now = performance.now();
        ripples.forEach(function (r) { r.born = now; });   // the clock starts once it's on screen
        draw();
        canvas.classList.add("is-visible");
        raf = requestAnimationFrame(frame);
      }
    });

    function draw() {
      var n = Math.min(ripples.length, MAX_RIPPLES);
      for (var i = 0; i < n; i++) {
        var r = ripples[ripples.length - n + i];
        data[i * 4] = r.x - window.scrollX;
        data[i * 4 + 1] = r.y - window.scrollY;
        data[i * 4 + 2] = r.age;
        data[i * 4 + 3] = r.strength;
      }
      gl.viewport(0, 0, texW, texH);
      gl.uniform2f(u.res, texW, texH);
      gl.uniform2f(u.size, cssW, cssH);
      gl.uniform4fv(u.ripples, data);
      gl.uniform1i(u.count, n);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame(now) {
      raf = 0;
      if (state !== "live") return;
      if (ehtOn() || reducedMotion.matches) { self.stop(); return; }
      // Wall-clock ages, so a slow frame never stretches the effect out.
      ripples.forEach(function (r) { r.age = self.hold == null ? (now - r.born) / 1000 : self.hold; });
      ripples = ripples.filter(function (r) { return r.age < LIFE; });
      if (!ripples.length) { self.stop(true); return; }
      copyCanvases();
      canvas.requestPaint();   // re-capture the clone (animations, canvases) for the next frame
      if (uploaded) draw();
      raf = requestAnimationFrame(frame);
    }

    // Ripple origins are kept in document coordinates, so they scroll with the page.
    this.add = function (x, y, strength) {
      ripples.push({ x: x + window.scrollX, y: y + window.scrollY, born: performance.now(), age: 0, strength: strength });
      if (ripples.length > MAX_RIPPLES) ripples.shift();
      if (state !== "idle") return true;
      if (!size()) { ripples = []; return false; }
      state = "preparing";
      document.body.appendChild(canvas);
      allocate();
      snapshot().then(function () {
        if (state !== "preparing") return;
        state = "priming";
        canvas.requestPaint();
      });
      return true;
    };

    this.scrolled = function () { if (state !== "idle" && clone) align(); };

    // End the effect; `gently` cross-fades back to the page (it is identical by now).
    this.stop = function (gently) {
      if (state === "idle") return;
      state = "idle";
      ripples = [];
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      canvas.classList.remove("is-visible");
      function remove() {
        if (state !== "idle") return;   // a new ripple took over the overlay
        canvas.remove();
        if (clone) clone.remove();
        clone = null;
        canvases = [];
      }
      if (gently) setTimeout(remove, FADE_MS); else remove();
    };

    this.active = function () { return state !== "idle"; };
  }

  function rgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) || [0, "6b", "1a", "2a"];
    return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  }

  var refractor = null, tried = false;
  function getRefractor() {
    if (!tried) {
      tried = true;
      try { if (supported()) refractor = new Refractor(); } catch (err) { refractor = null; }
    }
    return refractor && !refractor.broken ? refractor : null;
  }

  function trigger(x, y, strength) {
    if (reducedMotion.matches || ehtOn()) return;
    var r = getRefractor();
    if (!(r && r.add(x, y, strength == null ? 1 : strength))) ring(x, y);
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  document.addEventListener("click", function (e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
    var t = e.target;
    if (!(t instanceof Element) || t.closest(IGNORE)) return;
    if (!page.contains(t) && t !== document.body && t !== docEl) return;
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;    // they were selecting text
    trigger(e.clientX, e.clientY);
  });

  function stop() { if (refractor) refractor.stop(); }
  window.addEventListener("scroll", function () { if (refractor) refractor.scrolled(); }, { passive: true });
  window.addEventListener("resize", stop);
  document.addEventListener("keydown", stop);   // keep focus rings and typing on the real page
  document.addEventListener("visibilitychange", stop);
  document.addEventListener("selectionchange", function () {
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed) stop();        // show the selection on the real page
  });

  window.PageRipples = {
    trigger: trigger,
    hold: function (age) { var r = getRefractor(); if (r) r.hold = age; }   // testing: freeze ripples at this age
  };

  // Development only: #ripple-test sends a ripple from the middle of the screen;
  // #ripple-test=0.4 freezes it 0.4 s in (for screenshots).
  var test = /^#ripple-test(?:=([\d.]+))?$/.exec(location.hash);
  if (test && document.querySelector(".footer-art[data-dev=true]")) {
    window.addEventListener("load", function () {
      setTimeout(function () {
        var r = getRefractor();
        if (r && test[1]) r.hold = parseFloat(test[1]);
        trigger(innerWidth / 2, innerHeight / 2);
      }, 300);
    });
  }
})();
