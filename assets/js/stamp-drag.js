// Movable stamps: the stamps in a [data-stamp-tray] can be picked up and set
// down anywhere on the page's content area, with a mouse, a finger, a pen or
// the keyboard. Each stamp moves by an offset from its place in the tray, so
// the page's layout never shifts; it simply lies on top of the text, like a
// sticker. Where you drop it is remembered on this browser. Double-click (or
// double-tap, or Home when focused) puts it back.
//
// A plain click still re-stamps (stamps.js); a drag re-stamps once, on drop.
(function () {
  "use strict";

  var tray = document.querySelector("[data-stamp-tray]");
  if (!tray) return;

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var THRESHOLD = 4;        // px a press must move before it's a drag
  var NUDGE = 8, BIG_NUDGE = 48;
  var DOUBLE_TAP_MS = 350;
  var top = 10;             // z-index for the most recently moved stamp

  function storeKey(holder) { return "stamp-pos:" + location.pathname + "#" + holder.dataset.stampKey; }
  function load(holder) {
    try { return JSON.parse(localStorage.getItem(storeKey(holder))); } catch (e) { return null; }
  }
  function save(holder, s) {
    try {
      if (s.dx || s.dy) localStorage.setItem(storeKey(holder), JSON.stringify({ dx: s.dx, dy: s.dy }));
      else localStorage.removeItem(storeKey(holder));
    } catch (e) { /* private mode: it just won't be remembered */ }
  }

  function restamp(holder) {
    var svg = holder.querySelector("svg.stamp");
    if (svg && window.Stamps) window.Stamps.restamp(svg);
  }

  // Keep the whole stamp inside the content area (<main>).
  function clamp(holder, s) {
    var area = document.querySelector("main").getBoundingClientRect();
    var r = holder.getBoundingClientRect();
    var left = r.left - s.shownX, topEdge = r.top - s.shownY;   // its place in the tray
    s.dx = Math.round(Math.min(Math.max(s.dx, area.left - left), area.right - left - r.width));
    s.dy = Math.round(Math.min(Math.max(s.dy, area.top - topEdge), area.bottom - topEdge - r.height));
  }

  function apply(holder, s) {
    s.shownX = s.dx;
    s.shownY = s.dy;
    holder.style.setProperty("--dx", s.dx + "px");
    holder.style.setProperty("--dy", s.dy + "px");
  }

  function raise(holder) { holder.style.zIndex = ++top; }

  function reset(holder, s) {
    s.dx = s.dy = 0;
    if (!reducedMotion.matches) {
      holder.classList.add("is-returning");
      setTimeout(function () { holder.classList.remove("is-returning"); }, 400);
    }
    apply(holder, s);
    save(holder, s);
    restamp(holder);
    announce("Stamp put back.");
  }

  // One shared live region for keyboard and screen-reader feedback.
  var live = document.createElement("span");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  tray.appendChild(live);
  function announce(text) { live.textContent = text; }

  Array.prototype.forEach.call(tray.querySelectorAll("[data-stamp-key]"), function (holder) {
    var s = { dx: 0, dy: 0, shownX: 0, shownY: 0 };
    var press = null, dragging = false, justDragged = false, lastTap = 0, settleTimer = 0;
    var svg = holder.querySelector("svg.stamp");
    var label = svg ? svg.getAttribute("aria-label") : "Stamp";

    holder.tabIndex = 0;
    holder.setAttribute("role", "button");
    holder.setAttribute("aria-roledescription", "movable stamp");
    holder.setAttribute("aria-label", label + ". Drag, or use the arrow keys, to move it. Double-click or press Home to put it back.");
    holder.title = "Drag to move · double-click to put back";

    var saved = load(holder);
    if (saved) {
      s.dx = saved.dx || 0;
      s.dy = saved.dy || 0;
      apply(holder, s);
      raise(holder);
    }

    holder.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      press = { x: e.clientX, y: e.clientY, dx: s.dx, dy: s.dy, id: e.pointerId };
    });

    holder.addEventListener("pointermove", function (e) {
      if (!press || e.pointerId !== press.id) return;
      var mx = e.clientX - press.x, my = e.clientY - press.y;
      if (!dragging) {
        if (Math.hypot(mx, my) < THRESHOLD) return;
        dragging = true;
        holder.setPointerCapture(e.pointerId);
        holder.classList.add("is-held");
        raise(holder);
      }
      s.dx = press.dx + mx;
      s.dy = press.dy + my;
      clamp(holder, s);
      apply(holder, s);
    });

    function release(e) {
      if (!press || (e && e.pointerId !== press.id)) return;
      press = null;
      if (!dragging) return;
      dragging = false;
      justDragged = true;
      holder.classList.remove("is-held");
      save(holder, s);
      restamp(holder);
    }
    holder.addEventListener("pointerup", release);
    holder.addEventListener("pointercancel", release);

    // A drag ends in a click; don't let stamps.js re-stamp a second time.
    holder.addEventListener("click", function (e) {
      if (justDragged) { e.stopPropagation(); e.preventDefault(); justDragged = false; return; }
      // Double tap on touch screens (dblclick isn't reliable there).
      var now = Date.now();
      if (e.pointerType === "touch" && now - lastTap < DOUBLE_TAP_MS) { reset(holder, s); lastTap = 0; }
      else lastTap = now;
    }, true);
    holder.addEventListener("dblclick", function () { reset(holder, s); });

    holder.addEventListener("keydown", function (e) {
      var step = e.shiftKey ? BIG_NUDGE : NUDGE, moved = true;
      if (e.key === "ArrowLeft") s.dx -= step;
      else if (e.key === "ArrowRight") s.dx += step;
      else if (e.key === "ArrowUp") s.dy -= step;
      else if (e.key === "ArrowDown") s.dy += step;
      else if (e.key === "Home") { e.preventDefault(); reset(holder, s); return; }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); restamp(holder); return; }
      else moved = false;
      if (!moved) return;
      e.preventDefault();
      raise(holder);
      clamp(holder, s);
      apply(holder, s);
      // Set it down once the keys go quiet.
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function () { save(holder, s); restamp(holder); announce("Stamp set down."); }, 700);
    });

    // Stay inside the content area when the window changes size (and once the
    // page has its final layout, for a position saved on a different screen).
    function refit() {
      if (!s.dx && !s.dy) return;
      clamp(holder, s);
      apply(holder, s);
    }
    window.addEventListener("resize", refit);
    window.addEventListener("load", refit);
  });
})();
