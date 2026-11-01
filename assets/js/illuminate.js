// Illuminated initial: turns the first letter of any paragraph marked
// {: .illuminate } into a drop cap framed by a leafy vine, all in maroon.
// The vine draws itself around the letter, leaves unfurl as it passes,
// spirals curl off the corners and sides, then the letter inks in.
// The real letter stays in the text for screen readers; the artwork is
// decorative. Timing lives in site.css under "Illuminated initial".
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var INSET = 8, SIDE = 84;              // frame square inside the 100x100 viewBox
  var WAVES = 12, WOBBLE = 1.5;          // gentle undulation of the vine

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }
  function f(n) { return Math.round(n * 100) / 100; }

  // Point on the wavy frame at s in [0, 1), clockwise from the top-left corner.
  function frame(s) {
    var d = (s % 1) * 4, edge = Math.floor(d), t = d - edge;
    var a = INSET, b = INSET + SIDE, x, y, nx, ny;
    if (edge === 0) { x = a + t * SIDE; y = a; nx = 0; ny = -1; }
    else if (edge === 1) { x = b; y = a + t * SIDE; nx = 1; ny = 0; }
    else if (edge === 2) { x = b - t * SIDE; y = b; nx = 0; ny = 1; }
    else { x = a; y = b - t * SIDE; nx = -1; ny = 0; }
    var w = WOBBLE * Math.sin(2 * Math.PI * WAVES * s);
    return { x: x + nx * w, y: y + ny * w, nx: nx, ny: ny };
  }

  // Spiral curling from `start` around a centre `out` units away along (dx, dy).
  function spiral(start, dx, dy, out, turns, flip) {
    var cx = start.x + dx * out, cy = start.y + dy * out;
    var a0 = Math.atan2(start.y - cy, start.x - cx), d = "M" + f(start.x) + " " + f(start.y);
    for (var i = 1; i <= 40; i++) {
      var k = i / 40, r = out * (1 - 0.85 * k), a = a0 + flip * k * turns * 2 * Math.PI;
      d += " L" + f(cx + r * Math.cos(a)) + " " + f(cy + r * Math.sin(a));
    }
    return d;
  }

  function build(svg, letter) {
    // The vine itself
    var d = "";
    for (var i = 0; i <= 240; i++) {
      var p = frame(i / 240);
      d += (i ? " L" : "M") + f(p.x) + " " + f(p.y);
    }
    el("path", { class: "illum-vine", d: d + " Z", pathLength: "1" }, svg);

    // Spirals: big ones off each corner, small tendrils off each side's midpoint
    var spirals = [];
    [[0, -1, -1], [0.25, 1, -1], [0.5, 1, 1], [0.75, -1, 1]].forEach(function (c, i) {
      var r = Math.SQRT1_2;
      spirals.push({ s: c[0], d: spiral(frame(c[0]), c[1] * r, c[2] * r, 4.2, 1.6, i % 2 ? 1 : -1) });
    });
    [0.125, 0.375, 0.625, 0.875].forEach(function (s, i) {
      var p = frame(s);
      spirals.push({ s: s, d: spiral(p, p.nx, p.ny, 2.8, 1.4, i % 2 ? -1 : 1) });
    });
    spirals.forEach(function (sp) {
      el("path", { class: "illum-spiral", d: sp.d, pathLength: "1", style: "--s:" + sp.s }, svg);
    });

    // Leaves along the vine, alternating outward and inward, skipping spiral spots
    for (var j = 0; j < 32; j++) {
      var s = (j + 0.5) / 32;
      if (Math.abs((s * 8) - Math.round(s * 8)) < 0.2) continue;
      var a = frame(s), b = frame(s + 0.002);
      var tangent = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      var angle = tangent + (j % 2 ? 50 : -50);
      var g = el("g", { transform: "translate(" + f(a.x) + " " + f(a.y) + ") rotate(" + f(angle) + ")" }, svg);
      var leaf = el("g", { class: "illum-leaf", style: "--s:" + f(s) }, g);
      el("path", { d: "M0 0 Q2.6 -2.1 5.6 0 Q2.6 2.1 0 0 Z" }, leaf);
      el("path", { class: "illum-rib", d: "M0.6 0 L4.6 0" }, leaf);
    }

    var text = el("text", { class: "illum-letter", x: "50", y: "71", "text-anchor": "middle" }, svg);
    text.textContent = letter;
  }

  function illuminate(p) {
    // Find the first visible letter in the paragraph's text.
    var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    var node, match;
    while ((node = walker.nextNode()) && !(match = /\S/.exec(node.data))) {}
    if (!node) return;
    var letter = node.data[match.index];

    var cap = document.createElement("span");
    cap.className = "illuminated";
    build(el("svg", { viewBox: "0 0 100 100", "aria-hidden": "true", focusable: "false" }, cap), letter);
    var sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = letter;
    cap.appendChild(sr);

    // Replace the letter in the text with the illuminated version.
    var rest = node.splitText(match.index);
    rest.data = rest.data.slice(1);
    node.parentNode.insertBefore(cap, rest);
  }

  document.querySelectorAll("p.illuminate").forEach(illuminate);
})();
