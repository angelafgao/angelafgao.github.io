// Text that makes way for a stamp. Once a movable stamp (stamp-drag.js) has
// been picked up and set down on the page, the paragraphs under it re-flow
// around its outline, line by line, the way text runs around a real object.
// It's real text, not pixels: selectable, and its links still work.
//
// An ES module, imported by stamp-drag.js the first time a stamp is picked
// up, along with Pretext (assets/js/vendor/pretext). Each row of a touched
// block is split into the free spans either side of the stamp's footprint (a
// convex polygon: the ink's ellipse or rounded rectangle, turned with the
// stamp, plus a margin) and the block's words flow on through those spans.
// Links, italics and bold come along: every text node is a Pretext item with
// its own computed font, and each piece of a line is drawn inside shallow
// clones of the inline elements it came from. The block's own contents are
// wrapped in an invisible span (still there for screen readers, keyboards and
// clicks) and the new lines are laid over it; if the words need more rows than
// before, the block grows and pushes what follows down. When the stamp moves
// off, the wrapper is unwrapped and the block is exactly as it was.
//
// Adapted from the eht "parting" text on the pretext-black-hole branch.
import {
  prepareRichInline,
  walkRichInlineLineRanges,
  layoutNextRichInlineLineRange,
  materializeRichInlineLineRange
} from "./vendor/pretext/rich-inline.js";
import { clearCache } from "./vendor/pretext/layout.js";

var MIN_SPAN = 3.5;   // narrowest span worth filling beside the stamp, em
var MAX_ROWS = 400;
var BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, dt, dd, figcaption";
var move = Element.prototype.moveBefore ? "moveBefore" : "insertBefore";

// -----------------------------------------------------------------------------
// Reading a block: can Pretext lay it out the way the browser does?
// -----------------------------------------------------------------------------
function px(v) { return parseFloat(v) || 0; }

function fontOf(cs) {
  return cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
}

function hasContent(el, pseudo) {
  var s = getComputedStyle(el, pseudo);
  return s.content !== "none" && s.content !== "normal" && !/absolute|fixed/.test(s.position);
}

// Text styles Pretext can't match send the whole block back to native.
function plainText(cs) {
  return cs.fontVariantCaps === "normal" && px(cs.wordSpacing) === 0 &&
    (cs.textTransform === "none" || cs.textTransform === "uppercase");
}

// The block as Pretext items, one per text node, each with the chain of
// inline elements it sits in. null if it isn't a plain run of inline text.
function describe(el) {
  var cs = getComputedStyle(el);
  if (!/^(block|list-item)$/.test(cs.display) || !/^(static|relative)$/.test(cs.position)) return null;
  if (cs.whiteSpace !== "normal" || !/^(start|left)$/.test(cs.textAlign) || cs.direction !== "ltr") return null;
  if (px(cs.textIndent) || cs.hyphens === "auto" || !/px$/.test(cs.lineHeight) || !plainText(cs)) return null;
  if (hasContent(el, "::before") || hasContent(el, "::after")) return null;

  var items = [], chains = [], ok = true;
  function walk(node, chain, style) {
    for (var n = node.firstChild; n && ok; n = n.nextSibling) {
      if (n.nodeType === 3) {
        if (!n.data) continue;
        var item = { text: style.textTransform === "uppercase" ? n.data.toUpperCase() : n.data, font: fontOf(style) };
        var ls = px(style.letterSpacing), extra = 0;
        if (ls) item.letterSpacing = ls;
        for (var i = 0; i < chain.length; i++) extra += chain[i].extra;
        if (extra) item.extraWidth = extra;
        items.push(item);
        chains.push(chain);
      } else if (n.nodeType === 1) {
        var s = getComputedStyle(n);
        if (s.display === "none") continue;
        if (s.display !== "inline" || !plainText(s) || hasContent(n, "::before") || hasContent(n, "::after")) { ok = false; return; }
        // Padding, borders and margins: fine around a single run of text.
        var pad = px(s.paddingLeft) + px(s.paddingRight) + px(s.borderLeftWidth) +
          px(s.borderRightWidth) + px(s.marginLeft) + px(s.marginRight);
        if (pad && !(n.childNodes.length === 1 && n.firstChild.nodeType === 3)) { ok = false; return; }
        walk(n, chain.concat({ el: n, extra: pad }), s);
      }
    }
  }
  walk(el, [], cs);
  if (!ok || !items.length || !el.textContent.trim()) return null;

  return {
    el: el, items: items, chains: chains,
    lh: px(cs.lineHeight),
    minSpan: MIN_SPAN * px(cs.fontSize),
    balance: cs.textWrapStyle === "balance" || cs.textWrap === "balance",
    pl: px(cs.paddingLeft) + px(cs.borderLeftWidth), pr: px(cs.paddingRight) + px(cs.borderRightWidth),
    pt: px(cs.paddingTop) + px(cs.borderTopWidth), pb: px(cs.paddingBottom) + px(cs.borderBottomWidth),
    // the lines are positioned inside the border, from the padding edge
    padL: px(cs.paddingLeft), padT: px(cs.paddingTop),
    prep: null, bad: false, orig: null, part: null, key: "", grow: 0
  };
}

function contentBox(b, r) {
  return { left: r.left + b.pl, top: r.top + b.pt, width: r.width - b.pl - b.pr, height: r.height - b.pt - b.pb - b.grow };
}

function countLines(b, w) { return walkRichInlineLineRanges(b.prep, w, function () {}); }

// Prepare once (the expensive part), then check Pretext breaks the block
// into as many lines as the browser did; if not, leave it alone.
function prepare(b, box, rect) {
  try { b.prep = prepareRichInline(b.items); } catch (err) { b.bad = true; return; }
  b.boxW = box.width;
  b.boxH = box.height;
  b.h0 = rect.height;
  b.W = Math.round(box.width * 64) / 64;
  var n = countLines(b, b.W);
  if (b.balance && n > 1) {
    // text-wrap: balance: the narrowest width that keeps the line count
    var lo = b.W / n, hi = b.W;
    for (var i = 0; i < 12; i++) {
      var mid = (lo + hi) / 2;
      if (countLines(b, mid) > n) lo = mid; else hi = mid;
    }
    b.W = Math.ceil(hi * 4) / 4;
  }
  b.rows = Math.round(box.height / b.lh);
  b.bad = n !== b.rows || Math.abs(box.height - b.rows * b.lh) > 1;
}

// -----------------------------------------------------------------------------
// Layout: route the block's text through the spans the stamps leave free.
// -----------------------------------------------------------------------------

// Where a convex polygon crosses the horizontal slab top..bottom: its
// vertices inside the slab and its edges' crossings of the slab's two sides.
function band(poly, top, bottom) {
  var lo = Infinity, hi = -Infinity, n = poly.length;
  for (var i = 0; i < n; i++) {
    var p = poly[i], q = poly[(i + 1) % n];
    if (p[1] >= top && p[1] <= bottom) {
      if (p[0] < lo) lo = p[0];
      if (p[0] > hi) hi = p[0];
    }
    for (var k = 0; k < 2; k++) {
      var y = k ? bottom : top;
      if ((p[1] - y) * (q[1] - y) < 0) {
        var x = p[0] + ((y - p[1]) * (q[0] - p[0])) / (q[1] - p[1]);
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

// The free spans of the row from top to bottom (block coordinates), or null
// if no stamp touches it.
function spans(b, top, bottom, shapes) {
  var W = b.W, cut = [];
  for (var i = 0; i < shapes.length; i++) {
    var s = shapes[i];
    if (bottom <= s.t || top >= s.b) continue;
    var r = band(s.poly, top, bottom);
    if (r && r[1] > 0 && r[0] < W) cut.push(r);
  }
  if (!cut.length) return null;
  cut.sort(function (a, z) { return a[0] - z[0]; });
  var out = [], x = 0;
  for (var j = 0; j <= cut.length; j++) {
    var end = j < cut.length ? cut[j][0] : W;
    var a = Math.ceil(x * 4) / 4, z = Math.floor(Math.min(end, W) * 4) / 4;
    if (z - a >= b.minSpan) out.push({ x: a, w: z - a });
    if (j < cut.length) x = Math.max(x, cut[j][1]);
  }
  return out;
}

function layout(b, shapes) {
  var lines = [], cursor, y = 0, rows = 0, touched = false, whole = [{ x: 0, w: b.W }];
  for (var row = 0; row < MAX_ROWS; row++) {
    var free = spans(b, y, y + b.lh, shapes);
    if (free) touched = true; else free = whole;
    for (var i = 0; i < free.length; i++) {
      var s = free[i], range = layoutNextRichInlineLineRange(b.prep, s.w, cursor);
      if (!range) return { lines: lines, rows: rows, touched: touched };
      // Beside the stamp, rather leave a span empty than cut a word in two.
      if (s.w < b.W && range.end.graphemeIndex) continue;
      lines.push({ x: s.x, y: y, range: range });
      cursor = range.end;
      rows = row + 1;
    }
    y += b.lh;
  }
  return { lines: lines, rows: rows, touched: touched };
}

// -----------------------------------------------------------------------------
// Drawing: lines of shallow clones over the hidden original.
// -----------------------------------------------------------------------------
function clone(el) {
  var c = el.cloneNode(false);
  c.removeAttribute("id");
  if (c.tagName === "A") c.tabIndex = -1;   // the original keeps the tab stop
  return c;
}

function drawLine(b, line) {
  var div = document.createElement("span"), stack = [];
  div.className = "flow-line";
  div.style.left = line.x + "px";
  div.style.top = line.y + "px";
  // Open (or reuse) the clones for an item's chain, return the innermost.
  function enter(chain) {
    var k = 0;
    while (k < stack.length && k < chain.length && stack[k].src === chain[k].el) k++;
    stack.length = k;
    var parent = k ? stack[k - 1].copy : div;
    for (; k < chain.length; k++) {
      var c = clone(chain[k].el);
      parent.appendChild(c);
      stack.push({ src: chain[k].el, copy: c });
      parent = c;
    }
    return parent;
  }
  var frags = materializeRichInlineLineRange(b.prep, line.range).fragments;
  for (var i = 0; i < frags.length; i++) {
    var f = frags[i];
    // The space before a piece belongs to the item that measured it, so a
    // space inside a link is underlined and one after it isn't.
    if (f.gapBefore > 0 && f.gapItemIndex >= 0) enter(b.chains[f.gapItemIndex]).append(" ");
    enter(b.chains[f.itemIndex]).append(f.text);
  }
  return div;
}

// -----------------------------------------------------------------------------
// One flow per content column
// -----------------------------------------------------------------------------
export function createFlow(root) {
  var blocks = null, info = new Map(), flowed = new Set();

  function restore(b) {
    if (!b.part) return;
    var el = b.el;
    b.part.remove();
    while (b.orig.firstChild) el[move](b.orig.firstChild, b.orig);
    b.orig.remove();
    el.removeAttribute("data-flowed");
    el.style.minHeight = "";
    b.part = b.orig = null;
    b.key = "";
    b.grow = 0;
    flowed.delete(b);
  }

  // Lay the block out around the stamps; false if none of them touch its text.
  function part(b, box, shapes) {
    var local = shapes.map(function (s) {
      return {
        t: s.t - box.top, b: s.b - box.top,
        poly: s.poly.map(function (p) { return [p[0] - box.left, p[1] - box.top]; })
      };
    });
    var out = layout(b, local);
    if (!out.touched) return false;
    var lines = out.lines, grow = Math.max(0, out.rows - b.rows) * b.lh, key = grow + ":";
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i], e = l.range.end;
      key += l.x + "," + l.y + "," + e.itemIndex + "," + e.segmentIndex + "," + e.graphemeIndex + ";";
    }
    if (key === b.key) return true;      // the stamp moved, the words didn't
    b.key = key;
    var el = b.el;
    if (!b.part) {
      b.orig = document.createElement("span");
      b.orig.className = "flow-orig";
      el.insertBefore(b.orig, el.firstChild);
      while (b.orig.nextSibling) b.orig[move](b.orig.nextSibling, null);
      b.part = document.createElement("span");
      b.part.className = "flow-part";
      b.part.setAttribute("aria-hidden", "true");   // the original reads better
      el.appendChild(b.part);
      el.setAttribute("data-flowed", "");
      flowed.add(b);
    }
    // More rows than before: the block grows to hold them.
    if (grow !== b.grow) {
      b.grow = grow;
      el.style.minHeight = grow ? b.h0 + grow + "px" : "";
    }
    var st = b.part.style;
    st.left = b.padL + "px";
    st.top = b.padT + "px";
    st.width = b.W + "px";
    st.lineHeight = b.lh + "px";
    var frag = document.createDocumentFragment();
    for (var j = 0; j < lines.length; j++) frag.appendChild(drawLine(b, lines[j]));
    b.part.replaceChildren(frag);
    return true;
  }

  // shapes: [{ poly: [[x, y], ...] convex, viewport px; l, t, r, b: its bounds }]
  // Blocks are visited top to bottom and measured as they're reached, so a
  // block that grew (or shrank back) moves the ones after it first.
  function update(shapes) {
    if (!blocks) blocks = Array.prototype.slice.call(root.querySelectorAll(BLOCKS));
    for (var i = 0; i < blocks.length; i++) {
      var el = blocks[i], b = info.get(el), rect = el.getBoundingClientRect(), hit = false;
      for (var k = 0; k < shapes.length && !hit; k++) {
        var s = shapes[k];
        hit = rect.bottom > s.t && rect.top < s.b && rect.right > s.l && rect.left < s.r;
      }
      if (!hit) { if (b) restore(b); continue; }
      if (b === undefined) { b = describe(el); info.set(el, b); }
      if (!b) continue;
      var box = contentBox(b, rect);
      // Resized since it was measured (fonts, the window): read it again.
      if (b.prep && (Math.abs(box.width - b.boxW) > 0.5 || Math.abs(box.height - b.boxH) > 0.5)) {
        restore(b);
        b = describe(el);
        info.set(el, b);
        if (!b) continue;
        rect = el.getBoundingClientRect();
        box = contentBox(b, rect);
      }
      if (b.bad) continue;
      if (!b.prep) prepare(b, box, rect);
      if (b.bad) continue;
      try {
        if (!part(b, box, shapes)) restore(b);
      } catch (err) {
        // Something Pretext couldn't do: leave this block as the browser has it.
        restore(b);
        b.bad = true;
      }
    }
  }

  function restoreAll() { flowed.forEach(restore); }

  // Prepare the blocks a stamp hasn't reached yet, a few at a time while the
  // page is idle, so dragging onto them later doesn't stall on a first
  // measurement (the expensive part).
  var priming = 0;
  function prime() {
    if (priming || !window.requestIdleCallback) return;
    priming = requestIdleCallback(function step(deadline) {
      priming = 0;
      if (!blocks) blocks = Array.prototype.slice.call(root.querySelectorAll(BLOCKS));
      for (var i = 0; i < blocks.length; i++) {
        if (deadline.timeRemaining() < 4) { priming = requestIdleCallback(step); return; }
        var el = blocks[i], b = info.get(el);
        if (b === undefined) { b = describe(el); info.set(el, b); }
        if (!b || b.prep || b.bad || b.part) continue;
        var rect = el.getBoundingClientRect();
        try { prepare(b, contentBox(b, rect), rect); } catch (err) { b.bad = true; }
      }
    });
  }

  // Sizes or fonts changed: measure everything again.
  function invalidate() {
    restoreAll();
    blocks = null;
    info = new Map();
    clearCache();
    if (priming) { cancelIdleCallback(priming); priming = 0; }
  }

  return { update: update, restoreAll: restoreAll, invalidate: invalidate, prime: prime };
}

// Pretext's first prepare sets up its tables (~20ms): get that out of the way
// as soon as the module arrives rather than on the stamp's first touch.
export function warm(font) {
  prepareRichInline([{ text: "Stamped", font: font }]);
}
