// Paper: real paper texture behind any element marked data-paper="<look>",
// drawn once in WebGL with Paper Shaders' paper texture (vendored below,
// version 0.0.81, Apache-2.0). Until it draws, or without WebGL, the
// element's own background colour shows, so give it the paper's colour.
//
// Usage: <div class="paper-layer" data-paper="site" data-paper-seed="5" aria-hidden="true"></div>
// The layer must be an empty, positioned element; it fills its parent.
//
// Looks: the three stocks kept from the Fearn set (slate, thicket paper and
// the free receipt), plus "site": the Thicket paper in this site's cream.

import { ShaderMount } from "./vendor/paper-shaders-0.0.81/shader-mount.js";
import { getShaderColorFromString } from "./vendor/paper-shaders-0.0.81/get-shader-color-from-string.js";
import { getShaderNoiseTexture } from "./vendor/paper-shaders-0.0.81/get-shader-noise-texture.js";
import { paperTextureFragmentShader } from "./vendor/paper-shaders-0.0.81/shaders/paper-texture.js";

var GRAIN = { roughness: 0.25, roughnessSize: 0.35, fiber: 0.4, fiberSize: 0.4 };
var THICKET = { roughness: 0.25, roughnessSize: 0.3, fiber: 0.45, fiberSize: 0.35, rows: 0.5, drops: 0.12 };

export var LOOKS = {
  slate: Object.assign({}, GRAIN, { paper: "#86999a", shadow: "#33414090", drops: 0.15, seed: 51 }),
  thicket: Object.assign({}, THICKET, { paper: "#f9f8f1", shadow: "#9a978890", seed: 5 }),
  receipt: { paper: "#fdfcf8", shadow: "#a6a39890", roughness: 0.2, roughnessSize: 0.3, fiber: 0.35,
             fiberSize: 0.35, drops: 0, crumples: 0.55, crumpleCount: 5, folds: 0.45, foldSizeX: 0.6,
             foldSizeY: 0.85, angle: 60, seed: 49 },
  // The Thicket paper on the site's cream (--color-bg), with a warm shadow to match.
  site: Object.assign({}, THICKET, { paper: "#f3f0e9", shadow: "#968e7e90", seed: 5 })
};

var PAPER_REF = 900;   // the sheet height the grain is sized for
var noise = null;

function loadNoise() {
  noise = noise || new Promise(function (resolve, reject) {
    var img = getShaderNoiseTexture();
    if (img.complete && img.naturalWidth) resolve(img);
    else { img.onload = function () { resolve(img); }; img.onerror = reject; }
  });
  return noise;
}

// Draws `look` into `el` the first time it nears the screen. Returns a cleanup function.
export function mountPaper(el, look, seed) {
  var p = typeof look === "string" ? LOOKS[look] : look;
  var mount = null, dead = false, started = false;
  if (seed == null) seed = p.seed != null ? p.seed : 4;

  function size() {
    var r = el.getBoundingClientRect();
    return { u_imageAspectRatio: r.width / Math.max(1, r.height), u_scale: Math.max(1, r.height) / PAPER_REF };
  }

  function start() {
    started = true;
    loadNoise().then(function (tex) {
      if (dead) return;
      var c = getShaderColorFromString;
      mount = new ShaderMount(el, paperTextureFragmentShader, Object.assign({
        u_isImage: false, u_colorBack: c("#00000000"), u_colorPaper: c(p.paper), u_colorShadow: c(p.shadow),
        u_blending: 0, u_distortion: 0, u_clip: false, u_angle: p.angle != null ? p.angle : 300, u_seed: seed,
        u_roughness: p.roughness, u_roughnessSize: p.roughnessSize, u_roughnessRows: p.rows || 0,
        u_fiber: p.fiber, u_fiberSize: p.fiberSize, u_folds: p.folds || 0,
        u_foldSizeX: p.foldSizeX != null ? p.foldSizeX : 1, u_foldSizeY: p.foldSizeY != null ? p.foldSizeY : 1,
        u_foldOffsetX: p.foldOffsetX || 0, u_foldOffsetY: p.foldOffsetY || 0, u_wrinkles: 0, u_wrinkleSize: 0.65,
        u_crumples: p.crumples || 0, u_crumpleCount: p.crumpleCount != null ? p.crumpleCount : 6,
        u_drops: p.drops, u_noiseTexture: tex, u_fit: 2, u_rotation: 0, u_offsetX: 0, u_offsetY: 0,
        u_originX: 0.5, u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0
      }, size()), undefined, 0, 0);      // speed 0: draw once, no animation
      el.classList.add("is-drawn");
    }).catch(function () { /* no WebGL: the element's own background stays */ });
  }

  // data-paper-eager (the page background) draws straight away; anything
  // else waits until it nears the screen.
  var io = null;
  if (el.hasAttribute("data-paper-eager")) start();
  else {
    io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && !started) start();
    }, { rootMargin: "800px 0px" });
    io.observe(el);
  }
  var ro = new ResizeObserver(function () { if (mount) mount.setUniforms(size()); });
  ro.observe(el);
  return function () { dead = true; if (io) io.disconnect(); ro.disconnect(); if (mount) mount.dispose(); };
}

document.querySelectorAll("[data-paper]").forEach(function (el) {
  var seed = el.dataset.paperSeed;
  mountPaper(el, el.dataset.paper, seed != null ? +seed : null);
});
