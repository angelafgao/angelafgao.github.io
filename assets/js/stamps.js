// Stamps: each rubber stamp (_includes/stamp.html) lands with a quick
// "thunk" the first time it scrolls into view: it drops from a little larger
// and a little more turned onto its resting pose. Clicking a stamp stamps it
// again: a fresh impression (new ink texture) a degree or so off the last.
//
// Without JS the stamps are simply there. With reduced motion they stay
// still; a click only re-inks.
(function () {
  "use strict";

  if (window.__stamps) return;   // loaded once per page
  window.__stamps = true;

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var LAND_MS = 260;

  function tiltOf(el) {
    return parseFloat(el.style.getPropertyValue("--tilt")) || 0;
  }

  // The rotation it falls in from: a few degrees either way.
  function kick(el) {
    el.style.setProperty("--kick", ((Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3)).toFixed(1) + "deg");
  }

  function land(el) {
    el.classList.remove("is-armed", "is-thunk");
    el.classList.add("is-stamped");
    if (reducedMotion.matches) return;
    kick(el);
    void el.getBoundingClientRect();   // restart the animation
    el.classList.add("is-thunk");
    clearTimeout(el._stampTimer);
    el._stampTimer = setTimeout(function () { el.classList.remove("is-thunk"); }, LAND_MS + 60);
  }

  // A new impression: shift the noise seeds so the ink takes differently.
  function reink(el) {
    var bump = 1 + Math.floor(Math.random() * 97);
    var turb = el.querySelectorAll("feTurbulence");
    for (var i = 0; i < turb.length; i++) {
      var s = parseInt(turb[i].getAttribute("seed"), 10) || 0;
      turb[i].setAttribute("seed", s + bump);
    }
  }

  function restamp(el) {
    if (!el._baseTilt && el._baseTilt !== 0) el._baseTilt = tiltOf(el);
    reink(el);
    if (!reducedMotion.matches) {
      var t = el._baseTilt + (Math.random() * 3 - 1.5);
      el.style.setProperty("--tilt", t.toFixed(1) + "deg");
    }
    land(el);
  }

  function setup(root) {
    var stamps = (root || document).querySelectorAll("svg.stamp:not([data-stamp-ready])");
    if (!stamps.length) return;

    var io = null;
    if ("IntersectionObserver" in window && !reducedMotion.matches) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          land(e.target);
        });
      }, { threshold: 0.6 });
    }

    Array.prototype.forEach.call(stamps, function (el) {
      el.setAttribute("data-stamp-ready", "");
      el.addEventListener("click", function () { restamp(el); });
      if (io) { el.classList.add("is-armed"); io.observe(el); }
      else el.classList.add("is-stamped");
    });
  }

  // The playground calls this after it redraws its preview.
  window.Stamps = { setup: setup, land: land, restamp: restamp };

  setup();
})();
