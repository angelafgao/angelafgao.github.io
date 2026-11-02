// Watercolor wash: when the lightbox opens, the picture blooms onto its
// sheet of paper like a wet wash instead of fading in.
//
// A WebGL2 canvas sits over the lightbox <img> for ~1.4 s. Pigment spreads
// from the point that was clicked with a ragged, noise-driven wet edge,
// pools darker at the drying edge, granulates into the paper tooth, bleeds
// while wet and throws a few cauliflower blooms (backruns). Every effect is
// scaled by "live", which reaches 0 at the end, so the last frame is the
// plain image; then the real <img> is shown and the canvas hidden.
//
// Colours mix subtractively (Beer-Lambert): pigment density d over paper P
// gives P * (img / P)^d, so d = 1 is exactly the image and d > 1 is the
// darker pooled pigment at the edge.
//
// Without WebGL2, or with reduced motion, nothing here runs and the
// lightbox keeps its CSS fade.
(function () {
  "use strict";

  var DURATION = 1400;     // ms, bloom to crisp image
  var BLOOMS = 5;          // backruns per wash
  var DECODE_WAIT = 700;   // ms to wait for the image before giving up on the wash
  // The wet front's radius (in units of the farthest corner) over progress t:
  // FRONT_SCALE * ease(t / FRONT_END) - 0.03, easing out like a spreading wash.
  var FRONT_END = 0.68, FRONT_EASE = 1.6, FRONT_SCALE = 1.4;

  var VERT =
    "#version 300 es\n" +
    "in vec2 aPos;\n" +
    "out vec2 vUv;\n" +
    "void main() {\n" +
    "  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);\n" +   // y down, like the image
    "  gl_Position = vec4(aPos, 0.0, 1.0);\n" +
    "}\n";

  var FRAG = [
    "#version 300 es",
    "precision highp float;",
    "uniform sampler2D uImage;",
    "uniform vec2 uSize;        // canvas, device px",
    "uniform float uDpr;",
    "uniform float uInset;      // paper border, device px",
    "uniform vec2 uOrigin;      // where the wash starts, device px",
    "uniform float uReach;      // origin to farthest corner, device px",
    "uniform float uT;          // progress 0..1",
    "uniform float uSeed;",
    "uniform vec3 uPaper;",
    "uniform vec4 uBlooms[" + BLOOMS + "];  // xy centre px, z start time, w radius px",
    "in vec2 vUv;",
    "out vec4 outColor;",

    // Value noise and fbm, hand rolled.
    "float hash(vec2 p) {",
    "  p = fract(p * vec2(123.34, 456.21));",
    "  p += dot(p, p + 45.32);",
    "  return fract(p.x * p.y);",
    "}",
    "float vnoise(vec2 p) {",
    "  vec2 i = floor(p), f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),",
    "             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);",
    "}",
    "float fbm(vec2 p) {",
    "  float s = 0.0, a = 0.5;",
    "  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);",
    "  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = m * p; a *= 0.5; }",
    "  return s / 0.97;",          // ~0..1
    "}",

    "void main() {",
    "  vec2 px = vUv * uSize;",
    "  vec2 css = px / uDpr;",
    "  float t = uT;",
    "  float live = 1.0 - smoothstep(0.62, 1.0, t);",   // all effects fade out with this

    // Paper: fine grain plus larger tooth.
    "  float grain = vnoise(css / 1.7 + uSeed) * 0.6 + vnoise(css / 5.0 - uSeed) * 0.4;",
    "  float tooth = fbm(css / 38.0 + uSeed * 3.0);",

    // Wet front: distance from the origin, warped by fbm so the edge is ragged.
    "  vec2 q = (px - uOrigin) / uReach;",
    "  vec2 w = vec2(fbm(q * 2.3 + uSeed), fbm(q * 2.3 + uSeed + 7.1)) - 0.5;",
    "  float rag = fbm(q * 11.0 + w * 3.0 + uSeed * 1.7) - 0.5;",
    "  float dn = length(q) + 0.32 * (fbm(q * 1.6 + w * 1.6 + uSeed) - 0.5) + 0.045 * rag;",
    "  float grow = 1.0 - pow(1.0 - clamp(t / " + FRONT_END + ", 0.0, 1.0), " + FRONT_EASE.toFixed(2) + ");",
    "  float inside = grow * " + FRONT_SCALE.toFixed(2) + " - 0.03 - dn;",   // > 0 once pigment has arrived

    // Some stretches of edge stay hard (and pool dark), others feather out.
    "  float feather = smoothstep(0.5, 0.72, fbm(q * 3.5 - uSeed));",
    "  float soft = mix(0.004, 0.035, feather);",
    "  float cover = smoothstep(-soft, soft * 0.5, inside);",
    "  float pos = max(inside, 0.0);",
    "  float rim = cover * exp(-pos / 0.028) * (1.0 - feather * 0.8);",
    "  float wet = cover * exp(-pos / 0.2) * live;",

    // Freshly arrived pigment is thin; it charges up behind the edge.
    "  float density = mix(0.55, 0.9, smoothstep(0.0, 0.35, pos));",
    "  density += 0.85 * rim * live;",
    // Granulation: pigment settles into the valleys of the paper.
    "  density *= 1.0 + live * 0.4 * ((grain - 0.5) + 0.7 * (tooth - 0.5));",

    // Blooms: water creeps back into damp pigment, pushing it out to a
    // dark cauliflower ring.
    "  for (int i = 0; i < " + BLOOMS + "; i++) {",
    "    vec4 b = uBlooms[i];",
    "    float age = clamp((t - b.z) / 0.3, 0.0, 1.0);",
    "    if (age <= 0.0) continue;",
    "    float r = b.w * (1.0 - (1.0 - age) * (1.0 - age));",
    "    vec2 v = px - b.xy;",
    "    float dist = length(v);",
    "    if (dist > b.w * 1.7) continue;",              // too far to be touched; skip the noise
    "    vec2 dir = v / max(dist, 1.0);",               // lobes round the rim, plus ragged detail
    "    float lobes = fbm(dir * 2.2 + float(i) * 13.7 + uSeed);",
    "    float ragged = fbm(v / (b.w * 0.12) - float(i) * 5.3);",
    "    float rr = r * (0.65 + 0.55 * lobes + 0.12 * ragged);",
    "    float inner = 1.0 - smoothstep(rr * 0.75, rr, dist);",
    "    float ring = exp(-pow((dist - rr) / max(rr * 0.07, 1.5 * uDpr), 2.0));",
    "    float k = live * cover;",
    "    density *= 1.0 - 0.4 * inner * k;",
    "    density += 0.6 * ring * k * (1.0 - inner * 0.5);",
    "  }",
    "  density = mix(1.0, density, live);",

    // Sample the picture inside the paper border; blur and drift it while wet.
    "  vec2 content = uSize - 2.0 * uInset;",
    "  vec2 iuv = (px - uInset) / content;",
    "  vec2 drift = w * wet * 0.03;",
    "  float bias = wet * 4.5;",
    "  vec2 spread = vec2(wet * 5.0 * uDpr) / content;",
    "  vec3 img = texture(uImage, iuv + drift, bias).rgb * 0.4;",
    "  img += texture(uImage, iuv + drift + spread * vec2(1.0, 0.6), bias).rgb * 0.15;",
    "  img += texture(uImage, iuv + drift - spread * vec2(0.6, -1.0), bias).rgb * 0.15;",
    "  img += texture(uImage, iuv + drift + spread * vec2(-1.0, -0.6), bias).rgb * 0.15;",
    "  img += texture(uImage, iuv + drift - spread * vec2(-0.6, 1.0), bias).rgb * 0.15;",
    "  if (wet <= 0.0) img = texture(uImage, iuv).rgb;",   // exact once dry

    // Paper tone, a touch darker just ahead of the front where it is damp.
    "  float ahead = max(-inside, 0.0);",
    "  float damp = (1.0 - cover) * exp(-ahead / 0.05) * live * smoothstep(0.0, 0.06, t);",
    "  vec3 paper = uPaper * (1.0 - live * (0.05 * (tooth - 0.5) + 0.03 * (grain - 0.5)));",
    "  paper *= 1.0 - 0.05 * damp;",

    // Subtractive mix of pigment onto paper.
    "  vec3 absorb = -log(clamp(img / uPaper, 0.002, 4.0));",
    "  vec3 col = paper * exp(-absorb * max(density, 0.0) * cover);",

    "  bool inPic = all(greaterThanEqual(px, vec2(uInset))) && all(lessThanEqual(px, uSize - uInset));",
    "  outColor = vec4(inPic ? col : paper, 1.0);",
    "}"
  ].join("\n");

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var gl = null, canvas = null, prog = null, tex = null, loc = {};
  var supported = null;   // decided lazily, once
  var current = null;     // the running wash, if any

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function setup() {
    if (supported !== null) return supported;
    supported = false;
    try {
      canvas = document.createElement("canvas");
      canvas.className = "lightbox-wash";
      canvas.setAttribute("aria-hidden", "true");
      gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false });
      if (!gl) return false;

      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);

      // One triangle that covers the whole canvas.
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var aPos = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      ["uImage", "uSize", "uDpr", "uInset", "uOrigin", "uReach", "uT", "uSeed", "uPaper", "uBlooms"]
        .forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });

      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      canvas.addEventListener("webglcontextlost", function (e) {
        e.preventDefault();
        supported = false;
        if (current) current.finish();
      });
      supported = true;
    } catch (err) {
      gl = null;
    }
    return supported;
  }

  function parseColor(css) {
    var m = css.match(/[\d.]+/g) || [251, 249, 245];
    return [m[0] / 255, m[1] / 255, m[2] / 255];
  }

  function Wash(dialog, img, origin, freeze) {
    this.dialog = dialog;
    this.img = img;
    this.origin = origin;      // {x, y} as fractions of the picture, or null for the centre
    this.freeze = freeze;      // test hook: hold a single progress value
    this.raf = 0;
    this.done = false;
    var self = this;
    // "close" is queued, so it can land after a quick reopen; ignore it then.
    this.onClose = function () { if (!dialog.open) self.finish(); };
    dialog.addEventListener("close", this.onClose);
  }

  Wash.prototype.begin = function () {
    if (this.done) return;
    var img = this.img;
    if (!img.naturalWidth) return this.finish();

    try {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
    } catch (err) {
      return this.finish();
    }

    // Blooms, as fractions of the picture: centre, start time (filled in by
    // fit, once the front's speed is known) and radius.
    this.blooms = [];
    for (var i = 0; i < BLOOMS; i++) {
      this.blooms.push({ x: 0.1 + 0.8 * Math.random(), y: 0.1 + 0.8 * Math.random(),
                         lag: 0.06 + 0.1 * Math.random(), r: 0.06 + 0.08 * Math.random() });
    }
    gl.uniform1i(loc.uImage, 0);
    gl.uniform1f(loc.uSeed, Math.random() * 50);
    gl.uniform3fv(loc.uPaper, parseColor(getComputedStyle(img).backgroundColor));

    img.parentNode.insertBefore(canvas, img);
    canvas.hidden = false;
    this.t = this.freeze != null ? this.freeze : 0;
    if (!this.fit()) return this.finish();

    // Keep the canvas over the picture if the window is resized mid-wash.
    var self = this;
    this.resize = new ResizeObserver(function () { if (!self.fit()) self.finish(); });
    this.resize.observe(img);
    if (this.freeze != null) return;

    var start = performance.now();
    function frame(now) {
      var t = Math.min((now - start) / DURATION, 1);
      self.draw(t);
      if (t < 1) self.raf = requestAnimationFrame(frame);
      else self.finish();
    }
    this.raf = requestAnimationFrame(frame);
  };

  // Size the canvas to the <img> box (paper border included) and redraw.
  Wash.prototype.fit = function () {
    var img = this.img;
    var r = img.getBoundingClientRect(), pr = img.parentNode.getBoundingClientRect();
    var w = r.width, h = r.height;   // fractional, unlike offsetWidth
    if (!w || !h) return false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    var inset = parseFloat(getComputedStyle(img).paddingLeft) * dpr;

    canvas.width = W;
    canvas.height = H;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.style.left = r.left - pr.left + "px";
    canvas.style.top = r.top - pr.top + "px";

    // Start where the card was clicked (mapped onto the big picture), else the centre.
    var o = this.origin || { x: 0.5, y: 0.5 };
    var cw = W - 2 * inset, ch = H - 2 * inset;
    var ox = inset + o.x * cw, oy = inset + o.y * ch;
    var reach = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy));

    // Each bloom starts a little after the wet front has (roughly) reached it.
    var data = new Float32Array(BLOOMS * 4);
    this.blooms.forEach(function (b, i) {
      var bx = inset + b.x * cw, by = inset + b.y * ch;
      var reached = (Math.hypot(bx - ox, by - oy) / reach + 0.1) / FRONT_SCALE;   // allowing for the ragged edge
      var arrive = FRONT_END * (1 - Math.pow(Math.max(0, 1 - reached), 1 / FRONT_EASE));
      data.set([bx, by, Math.min(arrive + b.lag, 0.6), b.r * Math.min(W, H)], i * 4);
    });

    gl.viewport(0, 0, W, H);
    gl.uniform2f(loc.uSize, W, H);
    gl.uniform1f(loc.uDpr, dpr);
    gl.uniform1f(loc.uInset, inset);
    gl.uniform2f(loc.uOrigin, ox, oy);
    gl.uniform1f(loc.uReach, reach);
    gl.uniform4fv(loc.uBlooms, data);
    this.draw(this.t);
    return true;
  };

  Wash.prototype.draw = function (t) {
    this.t = t;
    gl.uniform1f(loc.uT, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Show the real image and put the canvas away. Safe to call more than once,
  // and a stale wash (e.g. a late "close" event) leaves a newer one alone.
  Wash.prototype.finish = function () {
    if (this.done) return;
    this.done = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    if (this.resize) this.resize.disconnect();
    this.dialog.removeEventListener("close", this.onClose);
    if (current !== this) return;
    current = null;
    this.dialog.classList.remove("is-washing");   // keep is-wash: dropping it would replay the CSS zoom
    canvas.hidden = true;
  };

  window.WatercolorWash = {
    // Call just before dialog.showModal(); returns true if a wash will run.
    // origin: {x, y} in 0..1 across the picture, or null for the centre.
    prepare: function (dialog, img, origin, freeze) {
      if (current) current.finish();
      dialog.classList.remove("is-wash");
      if (reducedMotion.matches || !setup()) return false;
      var wash = current = new Wash(dialog, img, origin, freeze);
      dialog.classList.add("is-wash", "is-washing");   // paper fade instead of the zoom; <img> hidden
      var started = false;
      function go() { if (!started) { started = true; wash.begin(); } }
      // Wait for the picture to decode; if it takes too long, just show it.
      if (freeze == null) wash.timer = setTimeout(function () { if (!started) { started = true; wash.finish(); } }, DECODE_WAIT);
      (img.decode ? img.decode() : Promise.resolve()).then(go, function () { wash.finish(); });
      return true;
    }
  };
})();
