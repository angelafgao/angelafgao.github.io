// Easter egg: type "eht" anywhere (or visit a page with #eht) to turn the
// cursor into a tiny black hole that gravitationally lenses the page around
// it. Press Esc (or type "eht" again) to switch it off.
//
// The page is bent with an SVG displacement filter. Its displacement map is
// the point-mass lens equation: a pixel at distance r from the lens shows
// what lies θE²/r closer to the centre, which smears content into arcs
// around the Einstein radius θE.
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

  function build() {
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

  function render() {
    raf = 0;
    if (!active) return;
    // Ease toward the pointer so the hole drifts rather than snaps.
    pos.x += (target.x - pos.x) * 0.35;
    pos.y += (target.y - pos.y) * 0.35;
    var rect = page.getBoundingClientRect();
    feImage.setAttribute("x", pos.x - rect.left - REACH);
    feImage.setAttribute("y", pos.y - rect.top - REACH);
    hole.style.transform = "translate(" + pos.x + "px," + pos.y + "px)";
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
    active = on;
    document.documentElement.classList.toggle("eht-on", on);
    page.style.filter = on ? "url(#eht-lens)" : "";
    if (on) {
      pos.x = target.x; pos.y = target.y;
      render();
      say("Event Horizon mode · press Esc to escape");
    } else {
      say("Back to flat spacetime");
    }
  }

  document.addEventListener("pointermove", function (e) {
    target.x = e.clientX; target.y = e.clientY;
    if (active) schedule();
  }, { passive: true });
  window.addEventListener("scroll", function () { if (active) schedule(); }, { passive: true });

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
