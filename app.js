/* SPIDER Workspace v0.1 — state-driven telemetry visual.
 * No simulation. No random motion. Every spider move comes from state.json.
 * Unknown stays unknown. Snapshots are snapshots, not real-time.
 */
(function () {
  "use strict";

  var POLL_MS = 7000;
  var STALE_MS = 180000; // 3 minutes without a fresh snapshot -> STALE

  var qs = new URLSearchParams(location.search);
  var STATE_URL = qs.get("src") || "state.json";

  var CX = 600, CY = 400, R = 270;

  // nodeName -> {x, y} | {angle} (computed on the ring) | special
  var RING_NODES = [
    ["TASK", -90], ["SEARCH", -50], ["COLLECT", -10],
    ["ANALYZE", 30], ["CONNECT", 70], ["VERIFY", 110],
    ["PROCESS", 150], ["RESULT", 190], ["COMPLETE", 230]
  ];
  var SPECIAL = {
    ERROR: { x: 1050, y: 120 },
    UNKNOWN: { x: 150, y: 120 },
    IDLE: { x: CX, y: CY }
  };

  var POS = { IDLE: { x: CX, y: CY } };
  RING_NODES.forEach(function (pair) {
    var rad = pair[1] * Math.PI / 180;
    POS[pair[0]] = { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
  });
  Object.keys(SPECIAL).forEach(function (k) {
    if (k !== "IDLE") POS[k] = SPECIAL[k];
  });

  var svgNS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent) {
    var n = document.createElementNS(svgNS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* Portrait zoom (~18%): crop the viewBox on narrow screens so the radial
   * workspace fills the frame. Visual only — no state, no coordinates change. */
  var svg = document.getElementById("web");
  function fitView() {
    var narrow = false;
    try {
      narrow = window.matchMedia && window.matchMedia("(max-width: 480px)").matches;
    } catch (e) { /* keep default */ }
    svg.setAttribute("viewBox", narrow ? "100 70 1000 660" : "0 0 1200 800");
  }
  fitView();
  if (window.addEventListener) window.addEventListener("resize", fitView);

  /* ---------- build web + nodes ---------- */
  var threadsG = document.getElementById("threads");
  var nodesG = document.getElementById("nodes");
  var nodeEls = {};

  // hub
  el("circle", { id: "hubRing", cx: CX, cy: CY, r: 46 }, nodesG);
  el("circle", { cx: CX, cy: CY, r: 46, fill: "url(#hubGlow)", stroke: "none" }, nodesG);
  var hubLabel = el("text", { id: "hubLabel", x: CX, y: CY + 66 }, nodesG);
  hubLabel.textContent = "HUB";

  Object.keys(POS).forEach(function (name) {
    if (name === "IDLE") return;
    var p = POS[name];
    el("line", {
      x1: CX, y1: CY, x2: p.x, y2: p.y,
      "class": "thread", "data-thread": name
    }, threadsG);

    var g = el("g", { "class": "node dim", id: "node-" + name }, nodesG);
    if (name === "UNKNOWN") g.setAttribute("class", "node dim dashed");
    el("circle", { "class": "node-ring", cx: p.x, cy: p.y, r: name === "ERROR" || name === "UNKNOWN" ? 22 : 26 }, g);
    var label = el("text", { "class": "node-label", x: p.x, y: p.y + 44 }, g);
    label.textContent = name;
    nodeEls[name] = g;
  });

  /* ---------- route graph (Design B, Phase 1) ----------
   * Pure, deterministic routing over the visible web. The spider's future
   * travel paths: spokes (hub<->node, the lines already drawn) and spiral
   * arcs (adjacent ring nodes, following the faint spiral circle).
   * Phase 1 is infrastructure only: routePath() is built and tested here,
   * and Phase 2 wires it to the rAF path-following driver below.
   * Nothing moves randomly; every leg lies on a visible web path. */
  var RING_ORDER = ["TASK", "SEARCH", "COLLECT", "ANALYZE", "CONNECT",
                    "VERIFY", "PROCESS", "RESULT", "COMPLETE"];

  function ringIndex(node) { return RING_ORDER.indexOf(node); }

  function isAdjacentRing(a, b) {
    var ia = ringIndex(a), ib = ringIndex(b);
    if (ia < 0 || ib < 0) return false;
    var d = Math.abs(ia - ib);
    return d === 1 || d === RING_ORDER.length - 1;
  }

  // visible spiral (very subtle): the web's capture spiral through the ring
  el("circle", { cx: CX, cy: CY, r: R, "class": "spiral" }, threadsG);

  // invisible route paths (getPointAtLength-ready). visibility:hidden keeps
  // getPointAtLength working in all browsers (unlike display:none).
  var routesG = el("g", { id: "routes" }, svg);
  var spokePaths = {}; // node -> path drawn hub->node
  var arcPaths = {};   // "A>B" in ring order -> circular arc A->B

  Object.keys(POS).forEach(function (name) {
    if (name === "IDLE") return;
    var p = POS[name];
    spokePaths[name] = el("path", {
      d: "M " + CX + " " + CY + " L " + p.x + " " + p.y,
      "class": "route-path", "data-route": "spoke:" + name
    }, routesG);
  });

  (function buildArcs() {
    for (var i = 0; i < RING_ORDER.length; i++) {
      var a = RING_ORDER[i], b = RING_ORDER[(i + 1) % RING_ORDER.length];
      var pa = POS[a], pb = POS[b];
      // circular arc along the ring; increasing angle = clockwise on screen
      // (y down), so sweep-flag 1.
      arcPaths[a + ">" + b] = el("path", {
        d: "M " + pa.x + " " + pa.y +
           " A " + R + " " + R + " 0 0 1 " + pb.x + " " + pb.y,
        "class": "route-path", "data-route": "arc:" + a + ">" + b
      }, routesG);
    }
  })();

  // Resolve one leg to a samplable path. Spokes are drawn hub->node;
  // arcs are drawn A->B in ring order; reverse flips travel direction.
  function resolveLeg(kind, from, to) {
    if (kind === "spoke") {
      var node = from === "IDLE" ? to : from;
      return { kind: kind, from: from, to: to,
               path: spokePaths[node], reverse: from !== "IDLE" };
    }
    var ia = ringIndex(from), ib = ringIndex(to);
    var forward = (ia + 1) % RING_ORDER.length === ib;
    var key = forward ? from + ">" + to : to + ">" + from;
    return { kind: kind, from: from, to: to,
             path: arcPaths[key], reverse: !forward };
  }

  // Pure & deterministic: same (from, to) -> same legs, every time.
  // [] = no travel (same node or invalid). One arc for adjacent ring
  // nodes, one spoke to/from the hub, otherwise two spokes via the hub.
  function routePath(from, to) {
    if (!from || !to || !POS[from] || !POS[to] || from === to) return [];
    if (from === "IDLE" || to === "IDLE") {
      return [resolveLeg("spoke", from, to)];
    }
    if (isAdjacentRing(from, to)) {
      return [resolveLeg("arc", from, to)];
    }
    return [resolveLeg("spoke", from, "IDLE"),
            resolveLeg("spoke", "IDLE", to)];
  }

  /* ---------- spider legs: articulated 3-segment (L0 anatomy) ----------
   * 8 legs, each: hip -> upper(26) -> knee -> lower(30) -> ankle -> foot(10) -> tip.
   * Nested <g> with transform-origin at each joint, ready for FK/IK in L1.
   * L0 is STATIC home stance only — no animation, no IK, no gait. */
  var LEG_UL = 26, LEG_LL = 30, LEG_FL = 10;
  var legHome = []; // per leg: {hx, hy, spread, kneeBend, ankleBend}
  var legEls = [];  // per leg: {hip, knee, ankle} element refs
  function buildLegs() {
    var legsG = document.getElementById("legs");
    // 8 legs: [hipX, hipY, spreadDeg]. Negative spread = left side.
    var defs = [
      [-6, -6, -35], [-7, -1, -70], [-7,  4, -110], [-6,  9, -145], // left 0-3
      [ 6, -6,  35], [ 7, -1,  70], [ 7,  4,  110], [ 6,  9,  145]  // right 4-7
    ];
    defs.forEach(function (d, i) {
      var hx = d[0], hy = d[1], spread = d[2];
      var side = spread < 0 ? -1 : 1;
      // Home stance joint angles. Knee bends outward, ankle counters slightly.
      // L1: kneeBend 70° gives ~83% ankle extension — a workable flexed
      // workspace for 2-bone IK (28°/40° left the leg near-singular at 95%+).
      var kneeBend = side * -70;   // further outward
      var ankleBend = side * 18;   // slight inward for the foot
      legHome.push({ hx: hx, hy: hy, spread: spread,
                     kneeBend: kneeBend, ankleBend: ankleBend });
      var leg = el("g", { "class": "leg", id: "leg" + i }, legsG);
      var hip = el("g", {
        "class": "hip",
        transform: "translate(" + hx + "," + hy + ") rotate(" + spread + ")"
      }, leg);
      el("circle", { "class": "joint hip-j", cx: 0, cy: 0, r: 2 }, hip);
      el("line", { "class": "seg upper", x1: 0, y1: 0, x2: 0, y2: -LEG_UL }, hip);
      var knee = el("g", {
        "class": "knee",
        transform: "translate(0," + (-LEG_UL) + ") rotate(" + kneeBend + ")"
      }, hip);
      el("circle", { "class": "joint knee-j", cx: 0, cy: 0, r: 1.8 }, knee);
      el("line", { "class": "seg lower", x1: 0, y1: 0, x2: 0, y2: -LEG_LL }, knee);
      var ankle = el("g", {
        "class": "ankle",
        transform: "translate(0," + (-LEG_LL) + ") rotate(" + ankleBend + ")"
      }, knee);
      el("circle", { "class": "joint ankle-j", cx: 0, cy: 0, r: 1.4 }, ankle);
      el("line", { "class": "seg foot", x1: 0, y1: 0, x2: 0, y2: -LEG_FL }, ankle);
      el("circle", { "class": "tip", cx: 0, cy: -LEG_FL, r: 1.2 }, ankle);
      legEls.push({ hip: hip, knee: knee, ankle: ankle });
    });
  }
  buildLegs();

  function setLegPose(i, hipDelta, kneeDelta, ankleDelta) {
    var h = legHome[i], j = legEls[i];
    j.hip.setAttribute("transform",
      "translate(" + h.hx + "," + h.hy + ") rotate(" + (h.spread + hipDelta) + ")");
    j.knee.setAttribute("transform",
      "translate(0," + (-LEG_UL) + ") rotate(" + (h.kneeBend + kneeDelta) + ")");
    j.ankle.setAttribute("transform",
      "translate(0," + (-LEG_LL) + ") rotate(" + (h.ankleBend + ankleDelta) + ")");
  }
  function resetLegPose(i) { setLegPose(i, 0, 0, 0); }

  /* ---------- L1: 2-bone analytic IK + single-leg step prototype ----------
   * Closed-form, no iteration, no library. Prototype only — manual trigger,
   * temporary rAF, 7 other legs stay in home stance. */
  function spiderTransform() {
    var tr = spider.getAttribute("transform") || "";
    var m = tr.match(/translate\(\s*([\d.e+-]+)[,\s]+([\d.e+-]+)\s*\)/);
    var r = tr.match(/rotate\(\s*([\d.e+-]+)\s*\)/);
    return { x: m ? parseFloat(m[1]) : 600,
             y: m ? parseFloat(m[2]) : 400,
             rot: r ? parseFloat(r[1]) : 0 };
  }

  // Forward kinematics: tip world position for leg i at home pose.
  function fkTipWorld(i) {
    var h = legHome[i], st = spiderTransform();
    var px = h.hx, py = h.hy, ang = h.spread;
    var rad;
    rad = ang * Math.PI / 180;
    px += LEG_UL * Math.sin(rad); py -= LEG_UL * Math.cos(rad);
    ang += h.kneeBend;
    rad = ang * Math.PI / 180;
    px += LEG_LL * Math.sin(rad); py -= LEG_LL * Math.cos(rad);
    ang += h.ankleBend;
    rad = ang * Math.PI / 180;
    px += LEG_FL * Math.sin(rad); py -= LEG_FL * Math.cos(rad);
    var sr = st.rot * Math.PI / 180;
    return { x: st.x + px * Math.cos(sr) - py * Math.sin(sr),
             y: st.y + px * Math.sin(sr) + py * Math.cos(sr) };
  }

  // 2-bone IK: place the TIP at targetWorld.
  // Foot keeps home world orientation; ankleTarget = tip - footVec.
  // Returns {hipDelta, kneeDelta} in degrees (ankle unchanged in L1).
  // Chirality: left legs -1, right legs +1 (knee outward, verified in test).
  function solveLegIK(i, targetWorld) {
    var h = legHome[i], st = spiderTransform();
    var sr = st.rot * Math.PI / 180;
    // Hip world position
    var H = { x: st.x + h.hx * Math.cos(sr) - h.hy * Math.sin(sr),
              y: st.y + h.hx * Math.sin(sr) + h.hy * Math.cos(sr) };
    // Foot world direction (home orientation): local -y rotated by total R
    var R = (st.rot + h.spread + h.kneeBend + h.ankleBend) * Math.PI / 180;
    var footVec = { x: LEG_FL * Math.sin(R), y: -LEG_FL * Math.cos(R) };
    var A = { x: targetWorld.x - footVec.x, y: targetWorld.y - footVec.y };
    // Clamp to reachable annulus
    var dx = A.x - H.x, dy = A.y - H.y;
    var d = Math.hypot(dx, dy);
    var maxD = LEG_UL + LEG_LL - 0.5, minD = Math.abs(LEG_UL - LEG_LL) + 0.5;
    var cd = Math.max(minD, Math.min(maxD, d));
    var angAH = Math.atan2(dy, dx);
    if (cd !== d) {
      A = { x: H.x + cd * Math.cos(angAH), y: H.y + cd * Math.sin(angAH) };
    }
    // Law of cosines
    var cosA = (LEG_UL * LEG_UL + cd * cd - LEG_LL * LEG_LL) / (2 * LEG_UL * cd);
    cosA = Math.max(-1, Math.min(1, cosA));
    var alpha = Math.acos(cosA);
    var chir = h.spread < 0 ? -1 : 1;
    var hipWorldAng = angAH + chir * alpha; // math angle, +x axis
    // Knee world position (for lower angle)
    var K = { x: H.x + LEG_UL * Math.cos(hipWorldAng),
              y: H.y + LEG_UL * Math.sin(hipWorldAng) };
    var lowerWorldAng = Math.atan2(A.y - K.y, A.x - K.x);
    // Convert to local deltas. Local -y at rotate(R) has math angle R-90.
    var norm = function (a) { return ((a + 540) % 360) - 180; };
    var hipDelta = norm(hipWorldAng * 180 / Math.PI + 90 - st.rot - h.spread);
    var rHip = st.rot + h.spread + hipDelta;
    var kneeDelta = norm(lowerWorldAng * 180 / Math.PI + 90 - rHip - h.kneeBend);
    // Keep foot world orientation fixed (compensate ankle for hip+knee rotation)
    // so the tip lands exactly on target.
    var ankleDelta = norm(-hipDelta - kneeDelta);
    return { hipDelta: hipDelta, kneeDelta: kneeDelta, ankleDelta: ankleDelta,
             _knee: K, _hip: H }; // exposed for tests
  }

  // L1 prototype: leg0 takes one step forward. Manual trigger only.
  // Exposed as window.__spider._legStep(). Temporary rAF, stops when done.
  var protoState = null;
  function legStepPrototype() {
    if (protoState) return false; // already running
    var i = 0;
    var st = spiderTransform();
    var sr = st.rot * Math.PI / 180;
    var fwd = { x: Math.sin(sr), y: -Math.cos(sr) }; // spider forward, world
    var P0 = fkTipWorld(i);
    var P1 = { x: P0.x + 8 * fwd.x, y: P0.y + 8 * fwd.y };
    protoState = { leg: i, P0: P0, P1: P1, t0: performance.now(), dur: 2000 };
    requestAnimationFrame(protoFrame);
    return true;
  }
  function protoFrame(now) {
    if (!protoState) return;
    var ps = protoState;
    var t = Math.min(1, (now - ps.t0) / ps.dur);
    var target;
    // SUPPORT 0-0.2 | LIFT 0.2-0.35 | SWING 0.35-0.65 | PLANT 0.65-0.8 | SUPPORT 0.8-1
    if (t < 0.2) {
      target = ps.P0;
    } else if (t < 0.35) {
      target = ps.P0; // lift = pause (visual cue via tip opacity below)
    } else if (t < 0.65) {
      var k = (t - 0.35) / 0.3;
      var s = k * k * (3 - 2 * k); // smoothstep
      target = { x: ps.P0.x + (ps.P1.x - ps.P0.x) * s,
                 y: ps.P0.y + (ps.P1.y - ps.P0.y) * s };
    } else {
      target = ps.P1;
    }
    var sol = solveLegIK(ps.leg, target);
    setLegPose(ps.leg, sol.hipDelta, sol.kneeDelta, sol.ankleDelta);
    // Lift cue: tip dims while "airborne" (LIFT/SWING phases)
    var tip = legEls[ps.leg].ankle.children.find(function (c) {
      return c.getAttribute && c.getAttribute("class") === "tip";
    });
    if (tip) tip.setAttribute("opacity", (t >= 0.2 && t < 0.65) ? "0.55" : "1");
    if (t >= 1) {
      protoState = null; // rAF stops; leg stays at new position
      return;
    }
    requestAnimationFrame(protoFrame);
  }
  function legPrototypeReset() {
    protoState = null;
    resetLegPose(0);
    var tip = legEls[0].ankle.children.find(function (c) {
      return c.getAttribute && c.getAttribute("class") === "tip";
    });
    if (tip) tip.setAttribute("opacity", "1");
  }

  var spider = document.getElementById("spider");
  var spiderTarget = "IDLE"; // last commanded node; spider never moves without state
  var spiderNode = "IDLE";   // last node where a journey actually completed
  var ripplesG = document.getElementById("ripples");

  /* Arrival ripple: purely state-driven visual feedback.
   * Fires only inside travelToNode(), i.e. only when state actually changed. */
  function ripple(x, y, hot) {
    var c = el("circle", {
      cx: x, cy: y, r: 26,
      "class": "ripple" + (hot ? " hot" : "")
    }, ripplesG);
    setTimeout(function () {
      if (c.parentNode) c.parentNode.removeChild(c);
    }, 1600);
  }

  /* ---------- rAF path-following driver (Design B, Phase 2) ----------
   * Replaces the CSS straight-line transition. The spider follows the
   * visible web paths from routePath(). Driven ONLY by the visual queue
   * and snapshot retargets — no rAF runs when idle, nothing random.
   * Journeys fill the 1.2s visual slot: single leg = 1200ms;
   * via-hub = 550ms + 100ms hub pause + 550ms. */
  var LEG_MS = 550, HUB_PAUSE_MS = 100;
  var journeyState = null; // {cancelled, rafId} while a journey is in flight

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Spider orientation (Design B Phase 3 P1): rotation degrees, 0 = facing up
  // (the artwork's head is at -y). Updated every frame from the path tangent
  // and lerped so the spider turns smoothly instead of snapping.
  var spiderAngle = 0;

  function lerpAngle(cur, target, t) {
    // Shortest-path turn: proportional for small corrections, rate-limited
    // for large ones so a ~180° reversal (e.g. at the hub) is a smooth turn,
    // never a sudden snap.
    var diff = ((target - cur + 540) % 360) - 180;
    var step = diff * t;
    var maxStep = 10; // degrees per frame
    if (step > maxStep) step = maxStep;
    if (step < -maxStep) step = -maxStep;
    return cur + step;
  }

  function spiderSetXY(x, y) {
    spider.setAttribute("transform",
      "translate(" + x + "," + y + ") rotate(" + spiderAngle.toFixed(1) + ")");
  }

  function spiderXY() {
    var tr = spider.getAttribute("transform") || "";
    var m = tr.match(/translate\(\s*([\d.e+-]+)[,\s]+([\d.e+-]+)\s*\)/);
    if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    var p = POS[spiderNode] || POS.IDLE;
    return { x: p.x, y: p.y };
  }

  // Explicit cancellation: the spider freezes where it is; it never
  // drifts to a stale target. The next travelLegs() blends from here.
  function cancelJourney() {
    if (journeyState) {
      journeyState.cancelled = true;
      try {
        if (journeyState.rafId) cancelAnimationFrame(journeyState.rafId);
      } catch (e) { /* harness without rAF */ }
      journeyState = null;
    }
  }

  // Travel routePath(fromNode,toNode) within totalMs. done(true) on full
  // completion (spiderNode advances); never resolves if cancelled.
  // The journey clock starts at call time and legs stay on schedule
  // (legStart advances by plan, not by frame time), so total duration is
  // exact and never overruns the queue slot.
  // If the spider isn't exactly at the path start (cancelled previous
  // journey), the opening blends from its visual position onto the path —
  // blend duration scales with the offset so corrections stay smooth.
  function travelLegs(fromNode, toNode, totalMs, done) {
    cancelJourney();
    var legs = routePath(fromNode, toNode);
    if (!legs.length) { if (done) done(true); return; }
    var plan = [];
    if (legs.length === 1) {
      plan.push({ leg: legs[0], dur: totalMs });
    } else {
      plan.push({ leg: legs[0], dur: LEG_MS });
      plan.push({ leg: null, dur: HUB_PAUSE_MS }); // dwell at hub
      plan.push({ leg: legs[1], dur: totalMs - LEG_MS - HUB_PAUSE_MS });
    }
    var state = { cancelled: false, rafId: 0 };
    journeyState = state;
    var startXY = spiderXY();
    var t0 = performance.now();
    var legIdx = -1, legStart = t0, legLen = 0, legPath = null, legReverse = false;
    var blendMs = 0, blendFrom = null, blendTo = null;

    function setupLeg(i) {
      legIdx = i;
      var item = plan[i];
      if (!item.leg) { legPath = null; return; } // hub pause: hold position
      legPath = item.leg.path;
      legReverse = !!item.leg.reverse;
      try { legLen = legPath.getTotalLength(); } catch (e) { legLen = 0; }
      if (i === 0 && legPath && legLen > 0) {
        var p0 = null;
        try { p0 = legPath.getPointAtLength(legReverse ? legLen : 0); }
        catch (e) { /* hold */ }
        if (p0) {
          var off = Math.hypot(p0.x - startXY.x, p0.y - startXY.y);
          if (off > 0.5) {
            blendFrom = { x: startXY.x, y: startXY.y };
            blendTo = { x: p0.x, y: p0.y };
            blendMs = Math.min(400, Math.max(120, off * 1.5));
          }
        }
      }
    }

    function frame(now) {
      if (state.cancelled) return;
      if (legIdx < 0) setupLeg(0);
      var item = plan[legIdx];
      var t = Math.min(1, (now - legStart) / item.dur);
      if (legPath && legLen > 0) {
        var e = easeInOutCubic(t);
        var dist = legReverse ? legLen * (1 - e) : legLen * e;
        var pt = null;
        try { pt = legPath.getPointAtLength(dist); } catch (err) { /* hold */ }
        if (pt) {
          // Face the travel direction: tangent from the actual path, lerped
          // so turns (including the ~180° at the hub) are smooth, never snap.
          // Artwork faces up (-y), so rotation = direction angle + 90°.
          var ahead = legReverse ? dist - 4 : dist + 4;
          ahead = Math.max(0, Math.min(legLen, ahead));
          var p2 = null;
          try { p2 = legPath.getPointAtLength(ahead); } catch (err2) { /* hold */ }
          if (p2 && (Math.abs(p2.x - pt.x) > 0.01 || Math.abs(p2.y - pt.y) > 0.01)) {
            var dirDeg = Math.atan2(p2.y - pt.y, p2.x - pt.x) * 180 / Math.PI;
            spiderAngle = lerpAngle(spiderAngle, dirDeg + 90, 0.18);
          }
          if (blendMs > 0 && legIdx === 0) {
            var bt = Math.min(1, (now - t0) / blendMs);
            var be = bt * bt * (3 - 2 * bt);
            spiderSetXY(blendFrom.x + (pt.x - blendFrom.x) * be,
                        blendFrom.y + (pt.y - blendFrom.y) * be);
            if (bt >= 1) blendMs = 0;
          } else {
            spiderSetXY(pt.x, pt.y);
          }
        }
      }
      if (t >= 1) {
        if (legIdx + 1 >= plan.length) {
          journeyState = null;
          if (done) done(true);
          return;
        }
        legStart += item.dur;
        setupLeg(legIdx + 1);
      }
      state.rafId = requestAnimationFrame(frame);
    }
    state.rafId = requestAnimationFrame(frame);
  }

  // Shared entry for queue items and snapshot retargets.
  // Always cancels any in-flight journey first (explicit — even when the
  // target equals the last completed node, a stale in-flight journey must
  // not be allowed to settle), then travels the web paths to the new one.
  function travelToNode(node) {
    if (!POS[node]) node = "UNKNOWN";
    cancelJourney();
    var from = spiderNode;
    spiderTarget = node;
    var p = POS[node];
    spider.setAttribute("opacity", "1");
    if (from !== node) {
      ripple(p.x, p.y, node === "ERROR");
      spider.setAttribute("class", "arrived");
      setTimeout(function () { spider.setAttribute("class", ""); }, 1200);
      // Journey fits INSIDE the 1.2s queue slot with a 50ms safety margin
      // (1150ms), so the queue's advance timer never cancels a journey just
      // before completion. Single leg = 1150ms; via-hub = 550 + 100 + 500.
      travelLegs(from, node, VISUAL_MIN_MS - 50, function (completed) {
        if (completed) spiderNode = node;
      });
    }
  }

  function paintNodes(state, spiderNode) {
    Object.keys(nodeEls).forEach(function (name) {
      var cls = "node dim" + (name === "UNKNOWN" ? " dashed" : "");
      nodeEls[name].setAttribute("class", cls);
    });
    document.querySelectorAll(".thread.lit").forEach(function (t) {
      t.setAttribute("class", "thread");
    });
    if (!state || !state.workflow) return;
    var wf = state.workflow;
    (wf.completed_nodes || []).forEach(function (n) {
      if (nodeEls[n]) nodeEls[n].setAttribute("class", "node done");
    });
    (wf.failed_nodes || []).forEach(function (n) {
      if (nodeEls[n]) nodeEls[n].setAttribute("class", "node failed");
    });
    // Highlight follows the spider (resolved work node), never a raw db pulse.
    var hubRing = document.getElementById("hubRing");
    if (hubRing) hubRing.setAttribute("class", spiderNode === "IDLE" ? "lit" : "");
    if (spiderNode && nodeEls[spiderNode] && spiderNode !== "IDLE") {
      nodeEls[spiderNode].setAttribute("class", "node active");
      var th = document.querySelector('[data-thread="' + spiderNode + '"]');
      if (th) th.setAttribute("class", "thread lit");
    }
    if ((wf.failed_nodes || []).length && nodeEls.ERROR) {
      nodeEls.ERROR.setAttribute("class", "node failed");
    }
  }

  /* JS mirror of the bridge's tool->node map (heuristic, documented).
   * "db" is deliberately absent: it is SYSTEM, never a work node. */
  var TOOL_NODE = {
    "search": "SEARCH", "browser.search": "SEARCH", "browser_search": "SEARCH",
    "deep_research": "SEARCH",
    "open": "COLLECT", "browser.open": "COLLECT", "find": "COLLECT",
    "read": "COLLECT", "memory_search": "COLLECT", "memory_get": "COLLECT",
    "exec": "PROCESS", "write": "PROCESS", "edit": "PROCESS",
    "todo.write": "ANALYZE", "subagent.spawn": "ANALYZE",
    "create_options": "RESULT"
  };
  function toolToNode(tool) {
    if (!tool) return "UNKNOWN";
    var key = String(tool).toLowerCase();
    if (TOOL_NODE[key]) return TOOL_NODE[key];
    if (key.indexOf("search") !== -1) return "SEARCH";
    return "UNKNOWN";
  }

  /* Latest genuine work node from activity, skipping SYSTEM (db) entries.
   * Returns null when nothing mappable exists — caller decides fallback. */
  function workNodeFromActivity(state) {
    var acts = (state && state.activity) || [];
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a.type === "tool" && a.tool && a.tool !== "db") {
        var n = toolToNode(a.tool);
        if (n !== "UNKNOWN" && POS[n]) return n;
      }
    }
    return null;
  }

  /* Resolve where the spider should be. Pure function of state + memory.
   * Rules: done -> COMPLETE; failed -> ERROR; idle/no task -> IDLE (hub);
   * db (SYSTEM) never drives movement: fall back to the latest genuine
   * work tool in activity, else hold last position; otherwise
   * workflow.active_node; unresolvable -> UNKNOWN. */
  function resolveTarget(state, prev) {
    if (!state) return prev || "IDLE";
    var taskStatus = state.task && state.task.status;
    if (taskStatus === "done") return "COMPLETE";
    if (taskStatus === "failed") return "ERROR";
    var agentStatus = state.agent && state.agent.status;
    if (agentStatus === "idle" || !taskStatus) return "IDLE";
    var tool = state.execution && state.execution.current_tool;
    if (tool === "db") {
      return workNodeFromActivity(state) || prev || "IDLE";
    }
    var active = state.workflow && state.workflow.active_node;
    if (active && POS[active]) return active;
    return "UNKNOWN";
  }

  /* ---------- readout ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fmtTime(ts) {
    if (!ts) return "—";
    try {
      var d = new Date(ts);
      if (isNaN(d)) return String(ts);
      return d.toISOString().substr(11, 8) + "Z";
    } catch (e) { return String(ts); }
  }
  function isSystemTool(tool) { return tool === "db"; }

  function render(state) {
    var ro = function (id, html) { document.getElementById(id).innerHTML = html; };
    var agentStatus = (state.agent && state.agent.status) || "unknown";
    ro("roAgent", esc(agentStatus.toUpperCase()));

    var task = state.task || {};
    var taskLabel = task.title ? esc(task.title) : "no active task";
    if (task.status) taskLabel += ' <span style="color:var(--dim)">[' + esc(task.status) + "]</span>";
    ro("roTask", taskLabel);

    var ex = state.execution || {};
    // Live telemetry owns the panel while active (priority LIVE > SNAPSHOT).
    // Snapshot only takes over after the hold expires.
    var liveOwnsPanel = Date.now() < livePanelUntil;
    if (!liveOwnsPanel) {
      ro("roStep", esc(ex.current_step || "UNKNOWN"));
      var toolHtml = esc(ex.current_tool || "—");
      if (isSystemTool(ex.current_tool)) toolHtml += '<span class="sys">SYSTEM</span>';
      else if (ex.tool_status) toolHtml += ' <span style="color:var(--dim)">[' + esc(ex.tool_status) + "]</span>";
      ro("roTool", toolHtml);
      ro("roLatest", esc(ex.latest_action || ex.latest_result_preview || "—"));
    }

    // BRIDGE OBSERVER: current activity comes from the bridge itself (db).
    // Explains why STEP and spider position may differ from the readout.
    document.getElementById("bridgeNote").hidden = !isSystemTool(ex.current_tool);

    // activity feed (latest 6)
    var list = document.getElementById("feedList");
    list.innerHTML = "";
    (state.activity || []).slice(0, 6).forEach(function (a) {
      var li = document.createElement("li");
      var cls = a.status === "success" ? "succ" : a.status === "running" ? "run" : a.status === "failed" ? "fail" : "";
      li.className = cls;
      var sys = isSystemTool(a.tool) ? ' <span class="badge-sys">SYSTEM</span>' : "";
      li.innerHTML = '<span class="t">' + esc(fmtTime(a.timestamp)) + "</span>" +
        '<span class="dot"></span>' +
        "<span>" + esc(a.label || "") + sys + "</span>";
      list.appendChild(li);
    });
    renderEventHistory(); // realtime event history sits atop snapshot activity

    paintNodes(state, resolveTarget(state, spiderTarget));
    var target = resolveTarget(state, spiderTarget);
    // Explicit retarget: cancel any in-flight journey so the spider never
    // settles on a stale target, then travel the web paths to the new one.
    if (target !== spiderTarget) travelToNode(target);
    else if (spider.getAttribute("opacity") === "0") travelToNode(target);
  }

  function renderAge(state) {
    var badge = document.getElementById("snapBadge");
    var meta = document.getElementById("snapMeta");
    if (!state || !state.updated_at) {
      badge.textContent = "NO DATA";
      badge.className = "stale";
      meta.textContent = "";
      return;
    }
    var ageMs = Date.now() - new Date(state.updated_at).getTime();
    var ageS = Math.max(0, Math.round(ageMs / 1000));
    var stale = ageMs > STALE_MS;
    badge.textContent = stale ? "STALE SNAPSHOT" : "LIVE SNAPSHOT";
    badge.className = stale ? "stale" : "live";
    meta.textContent = "updated " + fmtTime(state.updated_at) + " · age " + ageS + "s" +
      (stale ? " · last known position" : "");
  }

  var lastState = null;
  var lastAppliedAt = 0; // updated_at (ms) of the displayed state, any source

  /* Apply a state from ANY source (poll or ws). Newest wins; stale loses.
   * Idempotent: re-applying the same state never moves the spider twice. */
  function applyState(state, source) {
    if (!state || typeof state !== "object") return false;
    var t = Date.parse(state.updated_at);
    if (!isNaN(t)) {
      if (t < lastAppliedAt) return false;
      lastAppliedAt = t;
    }
    lastState = state;
    render(state);
    renderAge(state);
    return true;
  }

  function poll() {
    fetch(STATE_URL, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .then(function (state) {
        document.getElementById("offline").hidden = true;
        applyState(state, "poll");
      })
      .catch(function () {
        document.getElementById("offline").hidden = false;
      });
  }

  /* ---------- realtime via WebSocket (LIVE MODE) ----------
   * Public /ws only. No secret, no credential, no Cloudflare token here.
   * Polling above stays as fallback and keeps running always. */
  var WS_URL = qs.get("ws") ||
    "wss://spider-realtime-poc.sabuncolek1508.workers.dev/ws";
  var ws = null;
  // Connection states: CONNECTING (initial) | LIVE (socket open) |
  // RECONNECTING (closed, retry scheduled) | FALLBACK (max retries, polling only)
  var wsStatus = "CONNECTING";
  var wsRetryMs = 2000;
  var WS_RETRY_MAX = 60000;
  var WS_MAX_FAILS = 5; // after this many failed attempts -> FALLBACK
  var wsFails = 0;
  var reconnectTimer = null;
  var seenEventIds = new Set();
  var maxSeq = -1;

  function setConn(status) {
    wsStatus = status;
    var dot = document.getElementById("connDot");
    var txt = document.getElementById("connText");
    if (!dot || !txt) return;
    var cls = status === "LIVE" ? "on" : (status === "CONNECTING" || status === "RECONNECTING") ? "mid" : "";
    dot.setAttribute("class", cls);
    txt.setAttribute("class", cls);
    txt.textContent = status;
    var titles = {
      LIVE: "realtime via WebSocket — connected",
      CONNECTING: "connecting to realtime channel…",
      RECONNECTING: "connection lost — retrying…",
      FALLBACK: "realtime unavailable — polling state.json"
    };
    txt.setAttribute("title", titles[status] || status);
  }

  /* Validate + dedup a realtime envelope, then apply its state.
   * Returns true only when the state was actually applied. */
  function handleWsMessage(data) {
    var msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return false;
    }
    if (!msg || msg.type !== "spider_state" ||
        !msg.state || typeof msg.state !== "object") {
      return false;
    }
    if (msg.event_id) {
      if (seenEventIds.has(msg.event_id)) return false; // duplicate
      seenEventIds.add(msg.event_id);
      if (seenEventIds.size > 500) {
        seenEventIds = new Set(Array.from(seenEventIds).slice(-200));
      }
    }
    if (typeof msg.seq === "number" && isFinite(msg.seq)) {
      if (msg.seq <= maxSeq) return false; // old sequence; newer already seen
      maxSeq = msg.seq;
    }
    return applyState(msg.state, "ws");
  }

  /* ---------- action telemetry events (v0.3) ----------
   * Discrete, chronological work steps from the Action Telemetry Bridge.
   * type="spider_event". Ordering guard: (timestamp, seq, event_id) —
   * an older event never moves the spider back. Snapshot handler untouched. */
  var seenActionIds = new Set();
  var lastActionTs = 0;
  var lastActionSeq = -1;

  function setRo(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  var livePanelUntil = 0; // live telemetry owns roTool/roStep/roLatest until this time
  var LIVE_PANEL_HOLD_MS = 60000; // 60s after last live event, snapshot may take over

  // Panel follows LIVE telemetry (priority over snapshot). Called for every
  // non-system live/replayed event. db/SYSTEM never takes over the panel.
  function updateLivePanel(tool, node, status, ts) {
    livePanelUntil = Date.now() + LIVE_PANEL_HOLD_MS;
    setRo("roTool", esc(tool || "?") + statusTag(status));
    setRo("roStep", esc(node || "UNKNOWN"));
    var label = status === "done" ? "DONE" : status === "failed" ? "FAILED" : "STARTED";
    setRo("roLatest", esc(label + " · " + fmtTime(ts)));
  }

  /* ---------- visual event queue (v0.5) ----------
   * Realtime TOOL_STARTED events play through a FIFO visual queue so the
   * spider moves step-by-step at human speed (min 1.2s per event).
   * Telemetry itself is never slowed: events are received in real time,
   * recorded in history immediately, and never dropped for arriving fast.
   * Only the spider's MOVEMENT is paced. Snapshots (state.json) keep
   * newest-wins and never enter the queue. */
  var VISUAL_MIN_MS = 1200;
  var visualQueue = [];   // FIFO: {node, tool, event_id, ts, status}
  var queueBusy = false;
  var playingItem = null;
  var eventHistory = [];  // newest-first, max 8, real-time (not queued)

  function fmtClock(ts) {
    var d = new Date(ts);
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  function updateQueueIndicator() {
    var pill = document.getElementById("queuePill");
    if (!pill) return;
    var n = visualQueue.length;
    if (n > 0) {
      pill.hidden = false;
      pill.textContent = n + " QUEUED";
    } else {
      pill.hidden = true;
    }
  }

  function addEventHistory(ts, node, tool, status) {
    eventHistory.unshift({ clock: fmtClock(ts), node: node || "UNKNOWN",
                           tool: tool || "", status: status });
    if (eventHistory.length > 8) eventHistory.length = 8;
    renderEventHistory();
  }

  function renderEventHistory() {
    var list = document.getElementById("feedList");
    if (!list) return;
    var olds = list.querySelectorAll("li.ev-hist");
    for (var i = 0; i < olds.length; i++) olds[i].parentNode.removeChild(olds[i]);
    for (var j = eventHistory.length - 1; j >= 0; j--) {
      var e = eventHistory[j];
      var li = document.createElement("li");
      li.className = "ev-hist " + (e.status === "DONE" || e.status === "COMPLETE" ? "succ"
        : e.status === "FAILED" || e.status === "ERROR" ? "fail" : "run");
      li.innerHTML = '<span class="t">' + esc(e.clock) + "</span>" +
        '<span class="dot"></span><span><b>' + esc(e.node) + "</b> " + esc(e.status) +
        (e.tool ? ' <span class="dim">(' + esc(e.tool) + ")</span>" : "") + "</span>";
      list.insertBefore(li, list.firstChild);
    }
    while (list.children.length > 14) list.removeChild(list.lastChild);
  }

  function markQueuedTool(tool, ok) {
    var st = ok ? "done" : "failed";
    if (playingItem && playingItem.tool === tool && playingItem.status === "started") {
      playingItem.status = st;
      return true;
    }
    for (var i = 0; i < visualQueue.length; i++) {
      if (visualQueue[i].tool === tool && visualQueue[i].status === "started") {
        visualQueue[i].status = st;
        return true;
      }
    }
    return false;
  }

  function statusTag(status) {
    if (status === "done") return ' <span style="color:var(--ok)">[done]</span>';
    if (status === "failed") return ' <span style="color:var(--error)">[failed]</span>';
    return ' <span style="color:var(--accent)">[started]</span>';
  }

  function pumpQueue() {
    if (queueBusy) { updateQueueIndicator(); return; }
    var item = visualQueue.shift();
    updateQueueIndicator();
    if (!item) return;
    // A newer snapshot already superseded this event: skip the visual so
    // the spider never moves backwards. History already recorded it live.
    if (item.ts <= lastAppliedAt) { pumpQueue(); return; }
    queueBusy = true;
    playingItem = item;
    var label = item.node || "UNKNOWN";
    // Every queued item travels (started tool events, failed tools -> ERROR,
    // task completions -> COMPLETE). Successful TOOL_COMPLETED never enters
    // the queue at all (markQueuedTool only), so it can never move the spider.
    // same node twice: no move out-and-back; still occupies its 1.2s slot
    // and is recorded in history/readout like every other event.
    // travelToNode() drives the web-path journey (rAF); the queue's 1.2s
    // timer and the journey run in parallel and both last one slot.
    if (item.node && POS[item.node] && item.node !== spiderTarget) {
      travelToNode(item.node);
    }
    setRo("roTool", esc(item.tool || "?") + statusTag(item.status));
    setRo("roStep", esc(label));
    setTimeout(function () {
      queueBusy = false;
      playingItem = null;
      pumpQueue();
    }, VISUAL_MIN_MS);
  }

  // isReplay: bypasses the staleness guard (explicitly requested history),
  // but dedup by event_id still applies and the clock only moves forward.
  function handleActionEvent(msg, isReplay) {
    if (!msg || msg.type !== "spider_event" || !msg.event_type || !msg.event_id) {
      return false;
    }
    if (seenActionIds.has(msg.event_id)) return false; // duplicate
    var ts = Date.parse(msg.timestamp);
    var seq = typeof msg.seq === "number" && isFinite(msg.seq) ? msg.seq : -1;
    if (isNaN(ts)) return false;
    if (!isReplay && (ts < lastActionTs || (ts === lastActionTs && seq <= lastActionSeq))) {
      return false; // stale: never move the spider backwards
    }
    seenActionIds.add(msg.event_id);
    if (seenActionIds.size > 500) {
      seenActionIds = new Set(Array.from(seenActionIds).slice(-200));
    }
    // Clock only moves forward, even for replay.
    if (ts > lastActionTs || (ts === lastActionTs && seq > lastActionSeq)) {
      lastActionTs = ts;
      lastActionSeq = seq;
    }

    var et = msg.event_type;
    var node = msg.node;
    var tool = msg.tool;
    // defense in depth: the bridge filters db, but never let a system
    // tool move the spider even if one ever arrived
    var isSystem = tool === "db" || tool === "muse.db";

    if (et === "TOOL_STARTED") {
      if (isSystem) return true;
      // every valid TOOL_STARTED enters the visual FIFO; nothing is dropped
      // for arriving fast. History records it in real time.
      visualQueue.push({ node: node, tool: tool, event_id: msg.event_id,
                         ts: ts, status: "started" });
      addEventHistory(ts, node, tool, "STARTED");
      updateLivePanel(tool, node, "started", msg.timestamp);
      updateQueueIndicator();
      pumpQueue();
      return true;
    }
    if (et === "TOOL_COMPLETED" || et === "TOOL_FAILED") {
      var ok = msg.success !== false;
      if (tool && !isSystem) {
        markQueuedTool(tool, ok);
        addEventHistory(ts, node, tool, ok ? "DONE" : "FAILED");
        updateLivePanel(tool, node, ok ? "done" : "failed", msg.timestamp);
        // readout follows the live status of the displayed tool
        if (playingItem && playingItem.tool === tool) {
          setRo("roTool", esc(tool) + statusTag(ok ? "done" : "failed"));
        }
      }
      // a REAL tool failure is visualised as ERROR, in FIFO order like
      // everything else; completions never move the spider.
      if (!ok && !isSystem) {
        visualQueue.push({ node: "ERROR", tool: tool, event_id: msg.event_id + ":err",
                           ts: ts, status: "failed" });
        addEventHistory(ts, "ERROR", tool, "ERROR");
        updateQueueIndicator();
        pumpQueue();
      }
      return true;
    }
    if (et === "TASK_STARTED") {
      if (msg.task) {
        livePanelUntil = Date.now() + LIVE_PANEL_HOLD_MS;
        setRo("roTask", esc(msg.task) + ' <span style="color:var(--dim)">[working]</span>');
      }
      return true;
    }
    if (et === "TASK_COMPLETED") {
      // plays after the events already queued, then the spider rests at COMPLETE
      visualQueue.push({ node: "COMPLETE", tool: msg.task || "task",
                         event_id: msg.event_id, ts: ts, status: "done" });
      addEventHistory(ts, "COMPLETE", msg.task || "task", "COMPLETE");
      updateQueueIndicator();
      pumpQueue();
      return true;
    }
    if (et === "TASK_FAILED") {
      visualQueue.push({ node: "ERROR", tool: msg.task || "task",
                         event_id: msg.event_id, ts: ts, status: "failed" });
      addEventHistory(ts, "ERROR", msg.task || "task", "FAILED");
      updateQueueIndicator();
      pumpQueue();
      return true;
    }
    return false;
  }

  function dispatchRealtimeMessage(data) {
    var msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      return false;
    }
    if (msg && msg.type === "spider_event") return handleActionEvent(msg, false);
    // Replay: last N events sent by the server when this client connected.
    // Played through the same FIFO visual queue, in order, with dedup.
    if (msg && msg.type === "replay" && Array.isArray(msg.events)) {
      var any = false;
      for (var i = 0; i < msg.events.length; i++) {
        if (handleActionEvent(msg.events[i], true)) any = true;
      }
      return any;
    }
    if (msg && msg.type === "spider_state") {
      // reuse the snapshot validator inline (same rules as handleWsMessage)
      return handleWsMessage(data);
    }
    return false;
  }

  function onWsDown() {
    wsFails++;
    if (wsFails >= WS_MAX_FAILS) {
      setConn("FALLBACK"); // polling continues; retry in background every 60s
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      reconnectTimer = setTimeout(function () {
        reconnectTimer = null;
        wsFails = 0;
        connectWs();
      }, 60000);
      return;
    }
    setConn("RECONNECTING");
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connectWs();
    }, wsRetryMs);
    wsRetryMs = Math.min(wsRetryMs * 2, WS_RETRY_MAX);
  }

  function connectWs() {
    if (ws) {
      try { ws.close(); } catch (e) {}
      ws = null;
    }
    setConn(wsFails > 0 ? "RECONNECTING" : "CONNECTING");
    var socket;
    try {
      socket = new WebSocket(WS_URL);
    } catch (e) {
      onWsDown();
      return;
    }
    ws = socket;
    // If the handshake hangs (neither open nor close), force it down so
    // the indicator can never get stuck at CONNECTING forever.
    var hangTimer = setTimeout(function () {
      if (ws === socket && socket.readyState === 0) {
        try { socket.close(); } catch (e) {}
      }
    }, 10000);
    socket.onopen = function () {
      clearTimeout(hangTimer);
      if (ws !== socket) return; // stale socket
      wsFails = 0;
      wsRetryMs = 2000; // reset backoff on success
      setConn("LIVE");
    };
    socket.onmessage = function (ev) {
      if (ws !== socket) return;
      if (wsStatus !== "LIVE") setConn("LIVE"); // correct a desynced indicator
      dispatchRealtimeMessage(ev.data);
    };
    var onDown = function () {
      clearTimeout(hangTimer);
      if (ws === socket) ws = null;
      onWsDown(); // never resets the spider; never stops polling
    };
    socket.onclose = onDown;
    socket.onerror = onDown;
  }

  // Watchdog: the indicator must reflect the actual socket. Corrects any
  // desync (e.g. stuck CONNECTING while open, or LIVE while dead).
  setInterval(function () {
    if (!ws) {
      if (wsStatus === "LIVE") onWsDown();
      return;
    }
    if (ws.readyState === 1 && wsStatus !== "LIVE") setConn("LIVE");
    else if (ws.readyState === 0 && (wsStatus === "LIVE" || wsStatus === "FALLBACK")) {
      setConn(wsFails > 0 ? "RECONNECTING" : "CONNECTING");
    } else if (ws.readyState >= 2 && wsStatus === "LIVE") {
      onWsDown();
    }
  }, 5000);

  // expose for tests (node --check friendly, no-ops in browser)
  window.__spider = { resolveTarget: resolveTarget, toolToNode: toolToNode,
    workNodeFromActivity: workNodeFromActivity, POS: POS, STALE_MS: STALE_MS,
    fitView: fitView,
    _wsState: function () {
      return { status: wsStatus, maxSeq: maxSeq,
               seen: seenEventIds.size, retryMs: wsRetryMs,
               target: spiderTarget, lastAppliedAt: lastAppliedAt };
    },
    _handleWsMessage: handleWsMessage,
    _handleActionEvent: handleActionEvent,
    _dispatchRealtimeMessage: dispatchRealtimeMessage,
    _applyState: applyState,
    _queueLen: function () { return visualQueue.length; },
    _queueBusy: function () { return queueBusy; },
    _eventHistory: function () { return eventHistory.slice(); },
    _routePath: routePath,
    _travelToNode: travelToNode,
    _cancelJourney: cancelJourney,
    _spiderNode: function () { return spiderNode; },
    _spiderAngle: function () { return spiderAngle; },
    _legStep: legStepPrototype,
    _legReset: legPrototypeReset,
    _solveLegIK: solveLegIK,
    _fkTipWorld: fkTipWorld,
    _legHome: function () { return legHome; },
    _protoActive: function () { return !!protoState; },
    _journeyActive: function () { return !!journeyState; },
    _connectWs: connectWs };

  poll();
  setInterval(poll, POLL_MS);
  setInterval(function () { if (lastState) renderAge(lastState); }, 1000);
  setConn("CONNECTING");
  connectWs();
})();
