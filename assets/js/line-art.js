// Line drawings (_includes/line-art/): each one starts moving when it
// scrolls into view and stops when it leaves, so off-screen drawings cost
// nothing. The CSS in site.css ("Line drawings") does the animating and
// keeps everything still for reduced motion.
(function () {
  "use strict";

  var arts = document.querySelectorAll(".line-art");
  if (!arts.length || !("IntersectionObserver" in window)) return;

  function parts(svg) {
    var list = Array.prototype.slice.call(svg.querySelectorAll("[data-anim]"));
    if (svg.hasAttribute("data-anim")) list.push(svg);
    return list;
  }

  var watch = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      parts(e.target).forEach(function (el) { el.classList.toggle("is-playing", e.isIntersecting); });
    });
  }, { threshold: 0.25 });

  Array.prototype.forEach.call(arts, function (svg) { watch.observe(svg); });
})();
