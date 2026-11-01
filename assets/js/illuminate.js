// Illuminated initial: turns the first letter of any paragraph marked
// {: .illuminate } into a foliate drop cap, all in maroon. A thin double-ruled
// square holds a flowing stem that loops all the way around the letter, with
// branches curling into the spaces beside it and leaves along the way.
// On load the frame draws, the stem grows, branches curl and leaves unfurl
// as it passes, then the letter inks in.
// The real letter stays in the text for screen readers; the artwork is
// decorative. Timing lives in site.css under "Illuminated initial".
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  // The stem: a closed loop around the letter, starting at the bottom centre and
  // running up the left, over the top and down the right (100x100 viewBox).
  var STEM = [[50, 87], [37, 89], [24, 86], [16, 76], [14, 60], [19, 44], [15, 29], [24, 16],
              [38, 12], [50, 15], [62, 12], [76, 16], [85, 29], [81, 44], [86, 60], [84, 76],
              [76, 86], [63, 89]];
  // Branches: [spiral centre x, y, radius, turn direction]. Each grows from the
  // nearest point of the stem and curls around its centre; four down each side.
  var BRANCHES = [[31, 24, 4.3, 1], [29, 41, 5.6, -1], [29, 59, 5.6, 1], [31, 76, 4.3, -1],
                  [69, 24, 4.3, -1], [71, 41, 5.6, 1], [71, 59, 5.6, -1], [69, 76, 4.3, 1]];

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }
  function f(n) { return Math.round(n * 100) / 100; }

  // Small seeded random generator, so the variation is the same on every visit.
  function seeded(seed) {
    return function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  // Smooth curve through points (Catmull-Rom converted to cubic Béziers),
  // open by default or closed into a loop.
  function smooth(pts, closed) {
    var n = pts.length, d = "M" + f(pts[0][0]) + " " + f(pts[0][1]);
    function at(i) { return closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]; }
    for (var i = 0; i < (closed ? n : n - 1); i++) {
      var p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      d += " C" + f(p1[0] + (p2[0] - p0[0]) / 6) + " " + f(p1[1] + (p2[1] - p0[1]) / 6) +
           " " + f(p2[0] - (p3[0] - p1[0]) / 6) + " " + f(p2[1] - (p3[1] - p1[1]) / 6) +
           " " + f(p2[0]) + " " + f(p2[1]);
    }
    return closed ? d + " Z" : d;
  }

  // Point, tangent angle (degrees) and fraction t along an SVG path.
  function along(path, t) {
    var L = path.getTotalLength(), a = path.getPointAtLength(t * L), b = path.getPointAtLength(Math.min(L, t * L + 0.5));
    return { x: a.x, y: a.y, t: t, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
  }
  function nearest(path, x, y) {
    var best = null;
    for (var i = 0; i <= 200; i++) {
      var p = along(path, i / 200), d = Math.hypot(p.x - x, p.y - y);
      if (!best || d < best.d) { best = p; best.d = d; }
    }
    return best;
  }

  // A leaf with a pale midrib; --s sets when it unfurls (see site.css).
  function leaf(svg, x, y, angle, size, s) {
    var g = el("g", { transform: "translate(" + f(x) + " " + f(y) + ") rotate(" + f(angle) + ") scale(" + f(size) + ")" }, svg);
    var l = el("g", { class: "illum-leaf", style: "--s:" + f(s) }, g);
    el("path", { d: "M0 0 Q3.3 -2.7 7.2 0 Q3.3 2.7 0 0 Z" }, l);
    el("path", { class: "illum-rib", d: "M0.8 0 L5.9 0" }, l);
  }

  function ornament(svg, rand) {
    el("rect", { class: "illum-border", x: "2", y: "2", width: "96", height: "96", rx: "2.5", pathLength: "1" }, svg);
    el("rect", { class: "illum-border illum-border-inner", x: "4.5", y: "4.5", width: "91", height: "91", rx: "1.5", pathLength: "1" }, svg);

    var stem = el("path", { class: "illum-vine", d: smooth(STEM, true), pathLength: "1" }, svg);

    // Branches spiral off the stem into the open spaces
    BRANCHES.forEach(function (b) {
      var start = nearest(stem, b[0], b[1]);
      var r0 = Math.hypot(start.x - b[0], start.y - b[1]);
      var a0 = Math.atan2(start.y - b[1], start.x - b[0]), pts = [[start.x, start.y]];
      for (var i = 1; i <= 24; i++) {
        var k = i / 24, r = r0 * (1 - 0.82 * k), a = a0 + b[3] * k * 1.6 * 2 * Math.PI;
        pts.push([b[0] + r * Math.cos(a), b[1] + r * Math.sin(a)]);
      }
      var branch = el("path", { class: "illum-spiral", d: smooth(pts), pathLength: "1", style: "--s:" + f(start.t) }, svg);
      var p = along(branch, 0.22);
      leaf(svg, p.x, p.y, p.angle - b[3] * 55, 0.8 + rand() * 0.2, start.t + 0.05);
    });

    // Leaves along the stem, alternating sides, a little irregular
    var count = 22;
    for (var j = 0; j < count; j++) {
      var t = (j + 0.5) / count + (rand() - 0.5) * 0.02, q = along(stem, t);
      leaf(svg, q.x, q.y, q.angle + (j % 2 ? 1 : -1) * (40 + rand() * 20), 0.85 + rand() * 0.3, t);
    }
  }

  function illuminate(p, index) {
    // Find the first visible letter in the paragraph's text.
    var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    var node, match;
    while ((node = walker.nextNode()) && !(match = /\S/.exec(node.data))) {}
    if (!node) return;
    var letter = node.data[match.index];

    var cap = document.createElement("span");
    cap.className = "illuminated";
    var svg = el("svg", { viewBox: "0 0 100 100", "aria-hidden": "true", focusable: "false" }, cap);
    var sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = letter;
    cap.appendChild(sr);

    // Replace the letter in the text with the illuminated version.
    var rest = node.splitText(match.index);
    rest.data = rest.data.slice(1);
    node.parentNode.insertBefore(cap, rest);

    // Paths must be in the document to be measured, so draw after inserting.
    ornament(svg, seeded(letter.charCodeAt(0) * 7919 + index + 1));
    var text = el("text", { class: "illum-letter", x: "50", y: "71", "text-anchor": "middle" }, svg);
    text.textContent = letter;
  }

  document.querySelectorAll("p.illuminate").forEach(illuminate);
})();
