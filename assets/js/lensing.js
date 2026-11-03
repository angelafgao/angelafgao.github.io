// Easter egg: type "eht" anywhere (or visit a page with #eht) to turn the
// cursor into a tiny black hole that gravitationally lenses the page around
// it. Press Esc (or type "eht" again) to switch it off.
//
// Two renderers share the same point-mass lens equation, β = θ − θE² θ/|θ|²:
// a pixel at θ from the lens shows what lies at β, which smears content into
// arcs around the Einstein radius θE.
//
// 1. WebGL (browsers with HTML-in-Canvas): the live page is moved into a
//    full-viewport <canvas content="drawable"> and drawn through a fragment
//    shader, which also shows the inverted secondary image inside the ring,
//    a brightened Einstein ring, the shadow and the photon ring.
// 2. SVG (everywhere else): a displacement filter on .page approximates the
//    primary image only, and a CSS disc plays the shadow and photon ring.
(function () {
  "use strict";

  var TRIGGER = "eht";
  var EINSTEIN = 40;       // Einstein radius, px
  var REACH = 160;         // radius of the distorted region, px
  var MAX_SHIFT = 48;      // largest displacement encoded in the map, px

  var page = document.querySelector(".page");
  if (!page) return;

  var typed = "", active = false, built = false;
  var hole, toast, feImage, mapURL;
  var target = { x: innerWidth / 2, y: innerHeight / 2 }, pos = { x: target.x, y: target.y }, raf = 0;
  var gpu;                 // WebGL renderer: undefined = not tried yet, null = unavailable
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Displacement map: R/G encode the x/y shift, 128 = no shift.
  function buildMap() {
    var size = REACH * 2, c = document.createElement("canvas");
    c.width = c.height = size;
    var g = c.getContext("2d"), img = g.createImageData(size, size), d = img.data;
    for (var j = 0; j < size; j++) {
      for (var i = 0; i < size; i++) {
        var x = i + 0.5 - REACH, y = j + 0.5 - REACH, r = Math.hypot(x, y) || 1;
        var shift = Math.min((EINSTEIN * EINSTEIN) / r, MAX_SHIFT);
        var t = Math.min(1, r / REACH);
        shift *= 1 - t * t * (3 - 2 * t);                  // fade to zero at the edge
        var dx = (-x / r) * shift, dy = (-y / r) * shift;    // sample toward the lens
        var k = (j * size + i) * 4;
        d[k] = 128 + (127 * dx) / MAX_SHIFT;
        d[k + 1] = 128 + (127 * dy) / MAX_SHIFT;
        d[k + 2] = 128;
        d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function buildFilter() {
    mapURL = buildMap();
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    svg.innerHTML =
      '<filter id="eht-lens" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">' +
      '<feFlood flood-color="rgb(128,128,128)" result="neutral"/>' +
      '<feImage result="lens" preserveAspectRatio="none"/>' +
      '<feComposite in="lens" in2="neutral" operator="over" result="map"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="map" scale="' + MAX_SHIFT * 2 + '" xChannelSelector="R" yChannelSelector="G"/>' +
      "</filter>";
    document.body.appendChild(svg);
    feImage = svg.querySelector("feImage");
    feImage.setAttribute("href", mapURL);
    feImage.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", mapURL);
    feImage.setAttribute("width", REACH * 2);
    feImage.setAttribute("height", REACH * 2);
  }

  function build() {
    hole = document.createElement("div");
    hole.className = "eht-hole";
    hole.setAttribute("aria-hidden", "true");
    document.body.appendChild(hole);

    toast = document.createElement("div");
    toast.className = "eht-toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
    built = true;
  }

  // ---------------------------------------------------------------------------
  // WebGL renderer
  //
  // While active, the DOM looks like this:
  //   <div class="eht-spacer">                   keeps the document's scroll height
  //   <canvas class="eht-canvas" content="drawable">   fixed, fills the viewport
  //     <div class="eht-viewport" drawable>      viewport-sized paint root
  //       <div class="page">
  //
  // The window still scrolls natively (the spacer is as tall as the page); the
  // drawable is scrolled to match, so the texture is only ever one screen big
  // and .page itself is never restyled. We draw the drawable 1:1, and
  // updateElementGeometry() turns on hit testing for it there, so links,
  // hover, selection, focus and the footer animation all keep working on the
  // real DOM. .page is moved with moveBefore() where available (keeping focus
  // and listeners), and its CSS animations are put back where they were.
  // ---------------------------------------------------------------------------
  var VERT =
    "#version 300 es\n" +
    "in vec2 a_pos;\n" +
    "void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }\n";

  var FRAG =
    "#version 300 es\n" +
    "precision highp float;\n" +
    "uniform sampler2D u_page;\n" +
    "uniform vec2 u_res;\n" +        // canvas size, device px
    "uniform vec2 u_lens;\n" +       // lens centre, device px from the top left
    "uniform float u_re;\n" +        // Einstein radius θE, device px
    "uniform float u_reach;\n" +     // deflection has faded out by here
    "uniform float u_px;\n" +        // one CSS px in device px, for antialiasing
    "uniform vec3 u_bright, u_ring, u_dim, u_maroon;\n" +
    "out vec4 o;\n" +
    "void main() {\n" +
    "  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);\n" +
    "  vec2 th = p - u_lens;\n" +
    "  float r = max(length(th), 1e-3), x = r / u_re;\n" +
    // Lens equation, eased back to β = θ far out so most of the page is untouched.
    "  float fade = 1.0 - smoothstep(2.0 * u_re, u_reach, r);\n" +
    "  vec2 beta = th - fade * u_re * u_re * th / (r * r);\n" +
    "  vec3 col = texture(u_page, (u_lens + beta) / u_res).rgb;\n" +
    // Inside θE the source lands on the far side of the lens: the faint,
    // inverted secondary image. Dim it toward the shadow.
    "  col = mix(col, u_maroon * 0.35, 0.75 * smoothstep(1.0, 0.4, x));\n" +
    // Magnification μ = 1/|1 − (θE/θ)⁴| blows up on the Einstein ring; let
    // a clamped share of it brighten the ring.
    "  float mu = 1.0 / max(abs(1.0 - pow(1.0 / x, 4.0)), 1e-3);\n" +
    "  col = mix(col, u_bright, clamp((mu - 1.0) * 0.05, 0.0, 0.4) * fade);\n" +
    // Photon ring: thin, chartreuse, brighter on the approaching side (Doppler beaming).
    "  float rs = 0.32 * u_re, rp = rs + 2.5 * u_px;\n" +
    "  float side = 0.5 + 0.5 * cos(atan(th.y, th.x) - 3.6);\n" +
    "  vec3 ring = side > 0.5 ? mix(u_ring, u_bright, side * 2.0 - 1.0) : mix(u_dim, u_ring, side * 2.0);\n" +
    "  float band = smoothstep(rs - u_px, rs, r) * (1.0 - smoothstep(rp, rp + u_px, r));\n" +
    "  float glow = exp(-max(r - rp, 0.0) / (4.0 * u_px)) * (0.25 + 0.35 * side);\n" +
    "  col = mix(col, u_ring, glow * step(rs, r));\n" +
    "  col = mix(col, ring, band);\n" +
    // The shadow.
    "  col *= smoothstep(rs - u_px, rs, r);\n" +
    "  o = vec4(col, 1.0);\n" +
    "}\n";

  // Read a CSS color token as 0..1 RGB for a uniform.
  function token(name, fallback) {
    var probe = document.createElement("i");
    probe.style.color = "var(" + name + ", " + fallback + ")";
    document.body.appendChild(probe);
    var m = getComputedStyle(probe).color.match(/[\d.]+/g);
    probe.remove();
    return [m[0] / 255, m[1] / 255, m[2] / 255];
  }

  function makeGPU() {
    var canvas = document.createElement("canvas");
    canvas.setAttribute("content", "drawable");
    if (canvas.content !== "drawable" || !canvas.requestPaint || !canvas.updateElementGeometry) return null;
    var gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    if (!gl || !gl.texElementSubImage2D) return null;

    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, "a_pos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    // One triangle strip covering the canvas.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    var u = {};
    ["u_page", "u_res", "u_lens", "u_re", "u_reach", "u_px", "u_bright", "u_ring", "u_dim", "u_maroon"].forEach(function (n) {
      u[n] = gl.getUniformLocation(prog, n);
    });
    gl.uniform1i(u.u_page, 0);
    gl.uniform3fv(u.u_bright, token("--eht-ring-bright", "#eef4a8"));
    gl.uniform3fv(u.u_ring, token("--eht-ring", "#c7d33b"));
    gl.uniform3fv(u.u_dim, token("--eht-ring-dim", "#6d7720"));
    gl.uniform3fv(u.u_maroon, token("--color-text", "#6b1a2a"));

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    canvas.className = "eht-canvas";
    var view = document.createElement("div");
    view.className = "eht-viewport";
    view.setAttribute("drawable", "");
    canvas.appendChild(view);
    var spacer = document.createElement("div");
    spacer.className = "eht-spacer";

    var texW = 0, texH = 0, ready = false;
    var move = Element.prototype.moveBefore ? "moveBefore" : "insertBefore";

    // Re-parenting .page restarts its CSS animations (even with moveBefore,
    // for now), which would replay the illuminated initial. Put them back
    // where they were.
    function relocate(parent, before) {
      var was = page.getAnimations({ subtree: true }).map(function (a) {
        return { target: a.effect && a.effect.target, name: a.animationName, time: a.currentTime };
      });
      parent[move](page, before);
      page.getAnimations({ subtree: true }).forEach(function (a) {
        for (var i = 0; i < was.length; i++) {
          var w = was[i];
          if (w.name && w.name === a.animationName && w.target === (a.effect && a.effect.target)) {
            a.currentTime = w.time;
            was.splice(i, 1);
            return;
          }
        }
      });
    }

    // Size the drawing buffer in device pixels so the page stays crisp.
    var sizer = new ResizeObserver(function (entries) {
      var e = entries[0], box = e.devicePixelContentBoxSize && e.devicePixelContentBoxSize[0];
      canvas.width = box ? box.inlineSize : Math.round(e.contentRect.width * devicePixelRatio);
      canvas.height = box ? box.blockSize : Math.round(e.contentRect.height * devicePixelRatio);
      canvas.requestPaint();
    });
    var pageSizer = new ResizeObserver(function () { spacer.style.height = page.offsetHeight + "px"; });

    // The window scrolls; the clipped viewport follows it. If something else
    // scrolls the viewport (keyboard focus, #anchors), the window follows.
    function follow() {
      view.scrollLeft = scrollX;
      view.scrollTop = scrollY;
    }
    view.addEventListener("scroll", function () {
      if (Math.abs(view.scrollTop - scrollY) > 1 || Math.abs(view.scrollLeft - scrollX) > 1) {
        scrollTo(view.scrollLeft, view.scrollTop);
      }
    });

    // The page changed (or scrolled, or resized): copy it into the texture.
    canvas.addEventListener("paint", function () {
      var w = canvas.width, h = canvas.height;
      if (!w || !h) return;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (w !== texW || h !== texH) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        texW = w; texH = h;
      }
      gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, view);
      // Drawn 1:1 at the origin, so hit testing matches the layout.
      canvas.updateElementGeometry(view, { canvasTransform: new DOMMatrix() });
      ready = true;
      draw();
    });

    function draw() {
      if (!ready) return;
      var s = canvas.width / (canvas.clientWidth || 1);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.u_res, canvas.width, canvas.height);
      gl.uniform2f(u.u_lens, pos.x * s, pos.y * s);
      gl.uniform1f(u.u_re, 48 * s);
      gl.uniform1f(u.u_reach, 220 * s);
      gl.uniform1f(u.u_px, s);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    return {
      draw: draw,
      start: function () {
        var x = scrollX, y = scrollY;
        canvas.width = Math.round(innerWidth * devicePixelRatio);
        canvas.height = Math.round(innerHeight * devicePixelRatio);
        spacer.style.height = page.offsetHeight + "px";
        page.parentNode.insertBefore(spacer, page);
        document.body.insertBefore(canvas, spacer.nextSibling);
        relocate(view, null);
        follow();
        scrollTo(x, y);
        sizer.observe(canvas, { box: "device-pixel-content-box" });
        pageSizer.observe(page);
        addEventListener("scroll", follow, { passive: true });
      },
      stop: function () {
        var x = scrollX, y = scrollY;
        removeEventListener("scroll", follow);
        sizer.disconnect();
        pageSizer.disconnect();
        relocate(spacer.parentNode, spacer);
        spacer.remove();
        canvas.clearElementGeometry(view);
        canvas.remove();
        ready = false;
        scrollTo(x, y);
      }
    };
  }

  function render() {
    raf = 0;
    if (!active) return;
    // Ease toward the pointer so the hole drifts rather than snaps.
    var ease = gpu && reducedMotion.matches ? 1 : 0.35;
    pos.x += (target.x - pos.x) * ease;
    pos.y += (target.y - pos.y) * ease;
    if (gpu) {
      gpu.draw();
    } else {
      var rect = page.getBoundingClientRect();
      feImage.setAttribute("x", pos.x - rect.left - REACH);
      feImage.setAttribute("y", pos.y - rect.top - REACH);
      hole.style.transform = "translate(" + pos.x + "px," + pos.y + "px)";
    }
    if (Math.abs(target.x - pos.x) > 0.3 || Math.abs(target.y - pos.y) > 0.3) schedule();
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(render); }

  function say(text) {
    toast.textContent = text;
    toast.classList.add("is-visible");
    clearTimeout(say.timer);
    say.timer = setTimeout(function () { toast.classList.remove("is-visible"); }, 3200);
  }

  function setActive(on) {
    if (on === active) return;
    if (!built) build();
    if (gpu === undefined) {
      try { gpu = makeGPU(); } catch (err) { gpu = null; }
      if (!gpu) buildFilter();
    }
    active = on;
    document.documentElement.classList.toggle("eht-on", on);
    document.documentElement.classList.toggle("eht-gl", on && !!gpu);
    if (gpu) {
      if (on) gpu.start(); else gpu.stop();
    } else {
      page.style.filter = on ? "url(#eht-lens)" : "";
    }
    if (on) {
      pos.x = target.x; pos.y = target.y;
      render();
      say("Event Horizon mode · press Esc to escape");
    } else {
      cancelAnimationFrame(raf);
      raf = 0;
      say("Back to flat spacetime");
    }
  }

  document.addEventListener("pointermove", function (e) {
    target.x = e.clientX; target.y = e.clientY;
    if (active) schedule();
  }, { passive: true });
  window.addEventListener("scroll", function () { if (active && !gpu) schedule(); }, { passive: true });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && active) { setActive(false); return; }
    var el = e.target;
    if (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
    typed = (typed + e.key.toLowerCase()).slice(-TRIGGER.length);
    if (typed === TRIGGER) { typed = ""; setActive(!active); }
  });

  // Shareable: link to any page with #eht to arrive in Event Horizon mode.
  if (location.hash === "#eht") setActive(true);
})();
