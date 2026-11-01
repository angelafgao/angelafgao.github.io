// Illuminated initial: turns the first letter of any paragraph marked
// {: .illuminate } into a drop cap inside a square frame of leafy vine, all
// in maroon. The vine is a smooth, softly rounded square with a gentle wave;
// two tendrils grow in from opposite sides and curl beside the letter.
// On load the vine draws itself, leaves unfurl as it passes, the tendrils
// curl in, then the letter inks in.
// The real letter stays in the text for screen readers; the artwork is
// decorative. Timing lives in site.css under "Illuminated initial".
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var INSET = 7, SIZE = 86, RADIUS = 11;   // rounded-square frame in a 100x100 viewBox

  // Tendrils (defined for the lower-left; the other is rotated 180°).
  var TENDRIL = "M7 68 C17 70 25 62 24 52 C23 43 14 41 13 47 C12 52 19 53 19 48";
  var TENDRIL_LEAVES = [0.18, 0.36, 0.55];  // positions along the tendril

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

  // Smooth closed curve through points (Catmull-Rom converted to cubic Béziers).
  function smooth(pts) {
    var n = pts.length, d = "M" + f(pts[0].x) + " " + f(pts[0].y);
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += " C" + f(p1.x + (p2.x - p0.x) / 6) + " " + f(p1.y + (p2.y - p0.y) / 6) +
           " " + f(p2.x - (p3.x - p1.x) / 6) + " " + f(p2.y - (p3.y - p1.y) / 6) +
           " " + f(p2.x) + " " + f(p2.y);
    }
    return d + " Z";
  }

  // Point and tangent angle (degrees) at fraction t along an SVG path.
  function along(path, t) {
    var L = path.getTotalLength(), a = path.getPointAtLength(t * L), b = path.getPointAtLength(Math.min(L, t * L + 0.5));
    return { x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
  }

  // A leaf with a pale midrib; --s sets when it unfurls (see site.css).
  function leaf(svg, x, y, angle, size, s) {
    var g = el("g", { transform: "translate(" + f(x) + " " + f(y) + ") rotate(" + f(angle) + ") scale(" + f(size) + ")" }, svg);
    var l = el("g", { class: "illum-leaf", style: "--s:" + f(s) }, g);
    el("path", { d: "M0 0 Q3.3 -2.7 7.2 0 Q3.3 2.7 0 0 Z" }, l);
    el("path", { class: "illum-rib", d: "M0.8 0 L5.9 0" }, l);
  }

  function ornament(svg, rand) {
    // Sample a rounded square, then push each point in or out along a slow wave.
    var guide = el("path", { d: "M" + (INSET + RADIUS) + " " + INSET + " h" + (SIZE - 2 * RADIUS) +
      " a" + RADIUS + " " + RADIUS + " 0 0 1 " + RADIUS + " " + RADIUS + " v" + (SIZE - 2 * RADIUS) +
      " a" + RADIUS + " " + RADIUS + " 0 0 1 -" + RADIUS + " " + RADIUS + " h-" + (SIZE - 2 * RADIUS) +
      " a" + RADIUS + " " + RADIUS + " 0 0 1 -" + RADIUS + " -" + RADIUS + " v-" + (SIZE - 2 * RADIUS) +
      " a" + RADIUS + " " + RADIUS + " 0 0 1 " + RADIUS + " -" + RADIUS + " Z" }, svg);
    var L = guide.getTotalLength(), N = 48, phase = rand() * 6, pts = [];
    for (var i = 0; i < N; i++) {
      var s = i / N, a = guide.getPointAtLength(s * L), b = guide.getPointAtLength(((s + 0.004) % 1) * L);
      var tx = b.x - a.x, ty = b.y - a.y, len = Math.hypot(tx, ty) || 1;
      var wob = 1.1 * Math.sin(2 * Math.PI * 7 * s + phase);   // seven slow waves around
      pts.push({ x: a.x - (ty / len) * wob, y: a.y + (tx / len) * wob });
    }
    svg.removeChild(guide);
    var vine = el("path", { class: "illum-vine", d: smooth(pts), pathLength: "1" }, svg);

    // Leaves along the vine, alternating outward and inward
    var count = 26;
    for (var j = 0; j < count; j++) {
      var t = (j + 0.5) / count, p = along(vine, t);
      leaf(svg, p.x, p.y, p.angle + (j % 2 ? 1 : -1) * (40 + rand() * 20), 0.85 + rand() * 0.3, t);
    }

    // Two tendrils curling in beside the letter, rotationally balanced
    ["", "rotate(180 50 50)"].forEach(function (turn, k) {
      var g = el("g", turn ? { transform: turn } : {}, svg);
      var tendril = el("path", { class: "illum-spiral", d: TENDRIL, pathLength: "1", style: "--s:" + (k ? 0.35 : 0.85) }, g);
      TENDRIL_LEAVES.forEach(function (t, m) {
        var p = along(tendril, t);
        leaf(g, p.x, p.y, p.angle + (m % 2 ? 50 : -50), 0.8 + rand() * 0.2, (k ? 0.45 : 0.95) + m * 0.04);
      });
    });
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
