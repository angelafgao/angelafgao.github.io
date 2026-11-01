// Analytics events: counts a few clicks as GoatCounter events, alongside the
// page views that the GoatCounter script (vendor/goatcounter-count.v5.js)
// records by itself. Only loaded on production builds with a
// goatcounter_code set (see _config.yml and _layouts/default.html).
//
// Each click sends one readable label, most specific first:
//   cv                              the CV PDF
//   paper/<link label>/<title>      a publication's [arxiv], [code], ... link
//   project/<title>/<link label>    a Research project link or thumbnail
//   out/<hostname><pathname>        any other link to another site
//   gallery/<caption>               opening a painting on /about/
//   easter-egg/eht                  switching on Event Horizon mode
//
// Nothing else: no cookies or stored identifiers, no form input,
// keystrokes, mouse movement or scroll depth.
(function () {
  "use strict";

  var queue = [];

  // GoatCounter loads async, so hold events until window.goatcounter.count
  // exists. If it never does (blocked, offline), they are simply dropped.
  function ready() { return window.goatcounter && typeof window.goatcounter.count === "function"; }

  function send(path, title) {
    if (!ready()) { queue.push([path, title]); return; }
    window.goatcounter.count({ path: path, title: title || path, event: true });
  }

  window.addEventListener("load", function () {
    if (!ready()) return;
    var pending = queue; queue = [];
    pending.forEach(function (e) { send(e[0], e[1]); });
  });

  function text(el) { return (el.textContent || "").replace(/\s+/g, " ").trim(); }

  // Publication links render as "[arxiv]"; drop the brackets.
  function label(a) { return text(a).replace(/^\[(.*)\]$/, "$1") || "link"; }

  function eventFor(a) {
    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return null; }
    if (!/^https?:$/.test(url.protocol)) return null;   // mailto:, javascript:, ...

    if (url.origin === location.origin && /cv[^\/]*\.pdf$/i.test(url.pathname)) return ["cv", "CV download"];

    var pub = a.closest("[data-paper]");
    if (pub) return ["paper/" + label(a) + "/" + pub.dataset.paper, pub.dataset.paper];

    var project = a.closest(".project");
    if (project) {
      var title = text(project.querySelector(".project-title") || project);
      var what = a.classList.contains("project-thumb") ? "thumbnail" : label(a);
      return ["project/" + title + "/" + what, title];
    }

    if (url.origin !== location.origin) return ["out/" + url.hostname + url.pathname, url.href];
    return null;
  }

  function onClick(e) {
    if (e.type === "auxclick" && e.button !== 1) return;   // middle-click opens a tab too
    var target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    var card = target.closest(".clothesline-card[data-caption]");
    if (card) { send("gallery/" + card.dataset.caption, card.dataset.caption); return; }

    var a = target.closest("a[href]");
    if (!a) return;
    var ev = eventFor(a);
    if (ev) send(ev[0], ev[1]);
  }

  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", onClick, true);

  // The easter egg (lensing.js) announces itself; #eht links switch it on
  // before this script runs, so check for that too.
  document.addEventListener("eht:toggle", function (e) {
    if (e.detail && e.detail.on) send("easter-egg/eht", "Event Horizon mode");
  });
  if (document.documentElement.classList.contains("eht-on")) send("easter-egg/eht", "Event Horizon mode");
})();
