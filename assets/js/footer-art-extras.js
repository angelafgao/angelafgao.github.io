// Extra footer animations, loaded on localhost (so the font lab can switch
// between them) or when _config.yml picks one other than ripples.
// footer-art.js passes in env: canvas size (env.W, env.H), palette and helpers.
window.FooterArtExtras = function (env) {
  "use strict";

  var INK = env.INK, MUTED = env.MUTED, PAPER = env.PAPER, UI_FONT = env.UI_FONT;
  var rand = env.rand, clamp = env.clamp;

  // ---------------------------------------------------------------------------
  // 1. Seismograph: paper scrolls left past a fixed pen. Background noise, with
  //    an occasional earthquake (small fast P-wave, then a larger S-wave).
  // ---------------------------------------------------------------------------
  function Seismograph() {
    var STEP = 2, SPEED = 34;            // px per sample, px of paper per second
    var samples = [], offset = 0, scrolled = 0, t = 0, noise = 0;
    var quakes = [], nextQuake = rand(2, 4);

    function penX() { return env.W * 0.86; }

    function quakeAt(q, s) {             // s: seconds since the quake began
      var v = 0;
      if (s > 0) v += q.amp * 0.3 * Math.exp(-s * 1.8) * Math.sin(2 * Math.PI * 7 * s) * Math.min(1, s * 25);
      var ss = s - q.lag;
      if (ss > 0) v += q.amp * Math.exp(-ss * 0.8) * Math.min(1, ss * 8) *
        Math.sin(2 * Math.PI * 2.6 * ss + Math.sin(2 * Math.PI * 0.9 * ss));
      return v;
    }

    function background(ts) {
      noise = noise * 0.75 + (Math.random() - 0.5) * 2.4;
      return noise + 1.2 * Math.sin(ts * 1.7) + 0.8 * Math.sin(ts * 4.3);
    }

    this.resize = function () {
      var n = Math.ceil(penX() / STEP) + 2;
      // Pre-fill history with quiet noise so the trace is alive from the first frame.
      while (samples.length < n) samples.unshift(background(-samples.length * STEP / SPEED));
      if (samples.length > n) samples = samples.slice(samples.length - n);
    };

    this.poke = function () {
      quakes.push({ t0: t, amp: rand(0.6, 0.9) * env.H * 0.38, lag: rand(0.8, 1.5) });
    };

    this.update = function (dt) {
      t += dt;
      nextQuake -= dt;
      if (nextQuake <= 0) {
        this.poke();
        quakes[quakes.length - 1].amp *= rand(0.35, 0.85);
        nextQuake = rand(9, 18);
      }
      offset += dt * SPEED;
      scrolled += dt * SPEED;
      while (offset >= STEP) {
        offset -= STEP;
        var ts = t - offset / SPEED;
        var v = background(ts);
        for (var i = 0; i < quakes.length; i++) v += quakeAt(quakes[i], ts - quakes[i].t0);
        samples.push(clamp(v, -env.H / 2 + 4, env.H / 2 - 4));
        samples.shift();
      }
      quakes = quakes.filter(function (q) { return t - q.t0 < 10; });
    };

    this.draw = function (ctx) {
      var mid = env.H / 2, n = samples.length, pen = penX();

      // Tick marks printed on the paper, scrolling with it
      ctx.strokeStyle = MUTED;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = pen - (scrolled % 80); x > 0; x -= 80) { ctx.moveTo(x, env.H - 12); ctx.lineTo(x, env.H - 6); }
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.25;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var px = pen - (n - 1 - i) * STEP - offset, py = mid - samples[i];
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();

      // Pen arm and tip
      var tipY = mid - samples[n - 1];
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(pen - offset, tipY);
      ctx.lineTo(pen + 40, mid - 22);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(pen - offset, tipY, 2.2, 0, Math.PI * 2);
      ctx.fill();
    };
  }


  // ---------------------------------------------------------------------------
  // 3. Black hole: a blurry measurement slowly sharpens into the M87* ring and
  //    blurs again. Rendered at low resolution and upscaled, so blur is literal.
  // ---------------------------------------------------------------------------
  function BlackHole() {
    var PERIOD = 14, t = 0, focus = 0, hover = false, boost = 0;
    var off = document.createElement("canvas"), octx = off.getContext("2d");

    function heat(c) {                   // maroon -> orange -> pale gold
      if (c < 0.5) { var s = c / 0.5; return [107 + 107 * s, 26 + 72 * s, 42 - 2 * s]; }
      var u = (c - 0.5) / 0.5;
      return [214 + 36 * u, 98 + 117 * u, 40 + 100 * u];
    }

    this.resize = function () {};
    this.pointer = function (x, y) { hover = x != null && Math.hypot(x - env.W / 2, y - env.H / 2) < env.H; };
    this.poke = function () { boost = 4; };

    this.update = function (dt) {
      t += dt;
      boost = Math.max(0, boost - dt);
      var cycle = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / PERIOD);
      var target = hover || boost > 0 ? 1 : cycle;
      focus += (target - focus) * Math.min(1, dt * 1.5);
    };

    this.draw = function (ctx) {
      var res = Math.round(5 + focus * focus * 59);
      off.width = off.height = res;
      var img = octx.createImageData(res, res), d = img.data, spin = t * 0.12;
      for (var j = 0; j < res; j++) {
        for (var i = 0; i < res; i++) {
          var u = ((i + 0.5) / res) * 2 - 1, v = ((j + 0.5) / res) * 2 - 1;
          var r = Math.hypot(u, v), th = Math.atan2(v, u);
          var c = Math.exp(-Math.pow((r - 0.52) / 0.12, 2)) *
                  (0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.cos(th - spin - 2.2), 1.5));
          c += (1 - focus) * 0.08 * (Math.random() - 0.5) * Math.exp(-r * r * 2);
          c = clamp(c, 0, 1);
          var rgb = heat(c), k = (j * res + i) * 4;
          d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2];
          d[k + 3] = 255 * clamp(c * 1.6, 0, 1);
        }
      }
      octx.putImageData(img, 0, 0);

      var size = env.H * 0.92;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(off, env.W / 2 - size / 2, env.H / 2 - size / 2, size, size);

      ctx.globalAlpha = 0.35 + 0.5 * focus;
      ctx.fillStyle = MUTED;
      ctx.font = "11px " + UI_FONT;
      ctx.textBaseline = "middle";
      ctx.fillText("M87*", env.W / 2 + size / 2 + 10, env.H / 2);
      ctx.globalAlpha = 1;
    };
  }

  // ---------------------------------------------------------------------------
  // 4a. Bird on a rope (About page): a little bird lands on a sagging line,
  //     hops, and flies off. The rope dips under it. Get close and it startles.
  // ---------------------------------------------------------------------------
  function BirdOnRope() {
    var state = "away", wait = rand(0.5, 2), elapsed = 0, duration = 1;
    var bird = { x: 0, y: 0, facing: -1, flap: 0 }, from, ctrl, to;
    var land = 0, dip = 0, dipVel = 0, perchTime = 0, nextHop = 0, hopsLeft = 0, hopFrom = 0, hopTo = 0;

    function ropeY(x) { var u = x / env.W; return env.H * 0.42 + 64 * u * (1 - u) * (env.H / 120); }
    function ropeAt(x) { return ropeY(x) + dip * Math.exp(-Math.pow((x - land) / 110, 2)); }
    function bezier(a, c, b, s) {
      var m = 1 - s;
      return { x: m * m * a.x + 2 * m * s * c.x + s * s * b.x, y: m * m * a.y + 2 * m * s * c.y + s * s * b.y };
    }

    function leave() {
      state = "leaving"; elapsed = 0; duration = 1.4;
      from = { x: bird.x, y: bird.y };
      to = { x: -40, y: rand(-30, 0) };
      ctrl = { x: bird.x * 0.5, y: -env.H * 0.5 };
      bird.facing = -1;
      dipVel -= 35;
    }

    this.resize = function () {};
    this.poke = function () { if (state === "perched" || state === "hopping") leave(); };
    this.pointer = function (x, y) {
      if (x != null && state === "perched" && Math.hypot(x - bird.x, y - bird.y) < 45) leave();
    };

    this.update = function (dt) {
      elapsed += dt;
      bird.flap += dt * 22;
      dipVel += (-40 * dip - 4 * dipVel) * dt;
      dip += dipVel * dt;

      if (state === "away") {
        wait -= dt;
        if (wait <= 0) {
          state = "arriving"; elapsed = 0; duration = 1.8;
          land = rand(0.25, 0.75) * env.W;
          from = { x: env.W + 30, y: rand(-20, env.H * 0.15) };
          to = { x: land, y: ropeY(land) };
          ctrl = { x: (from.x + land) / 2, y: -env.H * 0.4 };
          bird.facing = -1;
        }
      } else if (state === "arriving") {
        var s = Math.min(1, elapsed / duration), e = 1 - Math.pow(1 - s, 2);
        var p = bezier(from, ctrl, to, e);
        bird.x = p.x; bird.y = p.y;
        if (s >= 1) {
          state = "perched"; elapsed = 0;
          dipVel += 70;
          perchTime = rand(3, 6); hopsLeft = Math.floor(rand(1, 3)); nextHop = rand(0.8, 1.6);
        }
      } else if (state === "perched") {
        land = bird.x;
        bird.y = ropeAt(bird.x);
        nextHop -= dt;
        if (hopsLeft > 0 && nextHop <= 0) {
          state = "hopping"; elapsed = 0;
          hopFrom = bird.x;
          hopTo = clamp(bird.x + rand(-40, 40), 40, env.W - 40);
          bird.facing = hopTo > hopFrom ? 1 : -1;
        } else if (elapsed > perchTime) {
          leave();
        }
      } else if (state === "hopping") {
        var h = Math.min(1, elapsed / 0.35);
        bird.x = hopFrom + (hopTo - hopFrom) * h;
        bird.y = ropeAt(bird.x) - Math.sin(Math.PI * h) * 12;
        if (h >= 1) { state = "perched"; dipVel += 30; hopsLeft--; nextHop = rand(0.8, 1.6); }
      } else if (state === "leaving") {
        var sl = Math.min(1, elapsed / duration);
        var q = bezier(from, ctrl, to, sl * sl);
        bird.x = q.x; bird.y = q.y;
        if (sl >= 1) { state = "away"; wait = rand(2, 5); }
      }
    };

    function drawBird(ctx, flying) {
      ctx.save();
      ctx.translate(bird.x, bird.y);
      ctx.scale(-bird.facing, 1);        // drawn facing left; flip to face right
      ctx.fillStyle = INK;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      if (!flying) {
        ctx.beginPath();
        ctx.moveTo(1, -4); ctx.lineTo(2, 0);
        ctx.moveTo(-2, -4); ctx.lineTo(-2, 0);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(0, -8, 8, 5.5, 0.15, 0, Math.PI * 2); ctx.fill();          // body
      ctx.beginPath(); ctx.arc(-7, -12, 3.8, 0, Math.PI * 2); ctx.fill();                    // head
      ctx.beginPath(); ctx.moveTo(-10.5, -12.5); ctx.lineTo(-14, -11.5); ctx.lineTo(-10.5, -10.5); ctx.fill(); // beak
      ctx.beginPath(); ctx.moveTo(7, -9); ctx.lineTo(14, -12); ctx.lineTo(13, -6.5); ctx.closePath(); ctx.fill(); // tail
      if (flying) {
        var lift = Math.sin(bird.flap) * 13;
        ctx.beginPath(); ctx.moveTo(-3, -9); ctx.lineTo(4, -9); ctx.lineTo(1, -9 - lift); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = PAPER;
      ctx.beginPath(); ctx.arc(-8, -13, 0.9, 0, Math.PI * 2); ctx.fill();                     // eye
      ctx.restore();
    }

    this.draw = function (ctx) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.25;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (var x = 0; x <= env.W + 6; x += 6) { if (x) ctx.lineTo(x, ropeAt(x)); else ctx.moveTo(x, ropeAt(x)); }
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (state !== "away") drawBird(ctx, state === "arriving" || state === "leaving");
    };
  }

  // ---------------------------------------------------------------------------
  // 4b. Ink line (Publications page): a pen writes a looping cursive line across
  //     the page, lifts now and then, then the ink fades and it starts again.
  // ---------------------------------------------------------------------------
  function InkLine() {
    var pts, time, phase, alpha, state, hold;

    function reset() { pts = []; time = 0; phase = rand(0, 100); alpha = 1; state = "writing"; hold = 1.5; }
    reset();

    function pen(t) {
      var loop = 6 + 5 * Math.pow(Math.sin(0.43 * t + phase), 2);
      return {
        x: 40 + 34 * t - loop * Math.sin(6.5 * t),
        y: env.H / 2 + loop * 1.4 * Math.cos(6.5 * t) + 7 * Math.sin(0.9 * t + phase),
        lift: Math.sin(0.55 * t + phase * 1.7) > 0.94
      };
    }

    this.resize = function () {};
    this.poke = function () { reset(); };

    this.update = function (dt) {
      if (state === "writing") {
        for (var k = 0; k < 4; k++) { time += dt / 4; pts.push(pen(time)); }
        if (pts[pts.length - 1].x > env.W - 40) state = "holding";
      } else if (state === "holding") {
        hold -= dt;
        if (hold <= 0) state = "fading";
      } else {
        alpha -= dt / 1.2;
        if (alpha <= 0) reset();
      }
    };

    this.draw = function (ctx) {
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      var down = false;
      pts.forEach(function (p) {
        if (p.lift) { down = false; return; }
        if (down) ctx.lineTo(p.x, p.y); else { ctx.moveTo(p.x, p.y); down = true; }
      });
      ctx.stroke();
      if (state === "writing" && pts.length) {
        var tip = pts[pts.length - 1];
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(tip.x, tip.y, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
  }

  // ---------------------------------------------------------------------------
  // 4c. Ticker (News page): recent news items scroll by. Hover to pause.
  // ---------------------------------------------------------------------------
  function Ticker() {
    var items = Array.prototype.map.call(document.querySelectorAll(".news-item"), function (p) {
      return p.textContent.replace(/\s+/g, " ").trim();
    }).filter(Boolean).slice(0, 6);
    if (!items.length) items = [document.title];
    var text = items.join("   ·   ") + "   ·   ";
    var x = 0, speed = 32, hover = false, width = 0;

    this.resize = function () {};
    this.pointer = function (px) { hover = px != null; };

    this.update = function (dt) {
      speed += ((hover ? 0 : 32) - speed) * Math.min(1, dt * 4);
      x -= speed * dt;
      if (width && x < -width) x += width;
    };

    this.draw = function (ctx) {
      ctx.font = "13px " + UI_FONT;
      ctx.fillStyle = INK;
      ctx.textBaseline = "middle";
      width = ctx.measureText(text).width;
      for (var px = x; px < env.W; px += width) ctx.fillText(text, px, env.H / 2);
    };
  }


  return {
    seismograph: Seismograph,
    blackhole: BlackHole,
    bird: BirdOnRope,
    ink: InkLine,
    ticker: Ticker
  };
};
