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
  var w1c_baseVB = { x: 0, y: 0, w: 1200, h: 800 }; // W1-C: base framing
  var w1c_cam = { fx: 600, fy: 400, zoom: 1 }; // W1-C: current focus (early init for fitView)
  var w1c_target = { fx: 600, fy: 400, zoom: 1 }; // W1-C: desired focus
  function fitView() {
    var narrow = false;
    try {
      narrow = window.matchMedia && window.matchMedia("(max-width: 480px)").matches;
    } catch (e) { /* keep default */ }
    w1c_baseVB = narrow ? { x: 100, y: 70, w: 1000, h: 660 } : { x: 0, y: 0, w: 1200, h: 800 };
    w1c_applyCamera(); // W1-C: re-apply pan/zoom on top of base
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

  /* ---------- W1-A: ambient static world ----------
   * Presentation only. Deterministic hardcoded coordinates — no Math.random().
   * 4 clusters, 90 secondary nodes, 129 ambient edges, 4 main visual paths.
   * Rendered once at init into <g id="ambient"> (behind #threads).
   * NEVER used by routePath(), gait, telemetry, or locomotion. */
  /* W3-B: structured ambient web.
   * The previous ambient graph used irregular cross-links that read as clutter.
   * This version uses deterministic radial spokes + concentric curved bands
   * in four quiet zones: fewer crossings, consistent spacing, more negative
   * space. Presentation only; never used by routing or locomotion. */
  var AMBIENT_WEB_ZONES = [
    { cx: 185, cy: 250, rx: 150, ry: 105, a0: 18, a1: 162, c: 0 },
    { cx: 1015, cy: 245, rx: 155, ry: 108, a0: 18, a1: 162, c: 1 },
    { cx: 1015, cy: 610, rx: 155, ry: 105, a0: 198, a1: 342, c: 2 },
    { cx: 185, cy: 610, rx: 145, ry: 100, a0: 198, a1: 342, c: 3 }
  ];
  var AMBIENT_CLUSTER_CLS = ["amb-near", "amb-near", "amb-mid", "amb-far"];

  function ambientPoint(z, ring, t) {
    var a = (z.a0 + (z.a1 - z.a0) * t) * Math.PI / 180;
    var scale = ring / 3;
    return [
      z.cx + Math.cos(a) * z.rx * scale,
      z.cy + Math.sin(a) * z.ry * scale
    ];
  }

  (function buildAmbient() {
    var g = document.getElementById("ambient");
    if (!g) return;
    var zone, ring, i, t, p, q, d, cls;

    for (var zi = 0; zi < AMBIENT_WEB_ZONES.length; zi++) {
      zone = AMBIENT_WEB_ZONES[zi];
      cls = AMBIENT_CLUSTER_CLS[zone.c];

      /* Three curved bands: clean concentric structure. */
      for (ring = 1; ring <= 3; ring++) {
        var rxs = zone.rx * ring / 3;
        var rys = zone.ry * ring / 3;
        var a0 = zone.a0 * Math.PI / 180;
        var a1 = zone.a1 * Math.PI / 180;
        var p0 = [zone.cx + Math.cos(a0) * rxs, zone.cy + Math.sin(a0) * rys];
        var p1 = [zone.cx + Math.cos(a1) * rxs, zone.cy + Math.sin(a1) * rys];
        d = "M " + p0[0].toFixed(1) + " " + p0[1].toFixed(1) +
            " A " + rxs.toFixed(1) + " " + rys.toFixed(1) +
            " 0 0 1 " + p1[0].toFixed(1) + " " + p1[1].toFixed(1);
        el("path", { d:d, "class":"amb-edge " + cls, "data-c":zone.c }, g);
      }

      /* Five evenly spaced radial strands. */
      for (i = 0; i < 5; i++) {
        t = i / 4;
        p = ambientPoint(zone, 0.45, t);
        q = ambientPoint(zone, 3, t);
        d = "M " + p[0].toFixed(1) + " " + p[1].toFixed(1) +
            " L " + q[0].toFixed(1) + " " + q[1].toFixed(1);
        el("path", { d:d, "class":"amb-edge " + cls, "data-c":zone.c }, g);
      }

      /* Nodes appear only at regular intersections. */
      for (ring = 1; ring <= 3; ring++) {
        for (i = 0; i < 5; i++) {
          t = i / 4;
          p = ambientPoint(zone, ring, t);
          el("circle", {
            cx:p[0].toFixed(1), cy:p[1].toFixed(1),
            r:ring === 3 ? 2.2 : 1.8,
            "class":"amb-node " + cls, "data-c":zone.c
          }, g);
        }
      }
    }
  })();

  // cluster index -> opacity class (depth hierarchy)
  var AMBIENT_CLUSTER_CLS = ["amb-near", "amb-near", "amb-mid", "amb-far"];

  (function buildAmbient() {
    var g = document.getElementById("ambient");
    if (!g) return;
    var i, n;
    // ambient edges (behind nodes)
    for (i = 0; i < AMBIENT_EDGES.length; i++) {
      var e = AMBIENT_EDGES[i];
      var a = AMBIENT_NODES[e[0]], b = AMBIENT_NODES[e[1]];
      el("line", {
        x1: a[0], y1: a[1], x2: b[0], y2: b[1],
        "class": "amb-edge " + AMBIENT_CLUSTER_CLS[a[2]],
        "data-c": a[2]
      }, g);
    }
    // main visual paths (polylines through cluster regions)
    for (i = 0; i < AMBIENT_PATHS.length; i++) {
      var pts = AMBIENT_PATHS[i].map(function (p) { return p[0] + "," + p[1]; }).join(" ");
      el("polyline", { points: pts, "class": "amb-main-path" }, g);
    }
    // secondary nodes
    for (i = 0; i < AMBIENT_NODES.length; i++) {
      n = AMBIENT_NODES[i];
      el("circle", {
        cx: n[0], cy: n[1], r: 3,
        "class": "amb-node " + AMBIENT_CLUSTER_CLS[n[2]],
        "data-c": n[2]
      }, g);
    }
  })();

  /* ---------- W1-B: Living Web Response ----------
   * Presentation only. Three additive visual responses, zero locomotion change.
   * W1-B1: active navigation path glow (clone of actual routePath leg).
   * W1-B2: nearest ambient cluster brightens on node change.
   * W1-B3: spider trail via MutationObserver (no rAF, no locomotion hook).
   * All disabled under prefers-reduced-motion. No Math.random(). */
  var W1B_NODE_CLUSTER = {
    TASK: 2, SEARCH: 2, COLLECT: 1, ANALYZE: 1, CONNECT: 1,
    VERIFY: 3, PROCESS: 3, RESULT: 0, COMPLETE: 0,
    UNKNOWN: 0, ERROR: 2, IDLE: -1
  };
  var w1b_activeOverlays = [];
  var w1b_activeCluster = -1;

  function w1b_setActivePath(fromNode, toNode) {
    w1b_clearActivePath();
    if (prefersReducedMotion) return;
    var legs = [];
    try { legs = routePath(fromNode, toNode); } catch (e) { return; }
    var threads = document.getElementById("threads");
    if (!threads) return;
    legs.forEach(function (leg) {
      if (!leg.path) return;
      var clone = leg.path.cloneNode(false);
      clone.removeAttribute("id");
      clone.setAttribute("class", "w1b-active-path");
      clone.removeAttribute("data-route");
      threads.parentNode.insertBefore(clone, threads);
      w1b_activeOverlays.push(clone);
    });
  }
  function w1b_clearActivePath() {
    w1b_activeOverlays.forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    w1b_activeOverlays = [];
  }

  // W2-B: cluster adjacency for local propagation (from inter-cluster edges)
  var W2B_ADJACENT = { 0: [1, 3], 1: [0, 2], 2: [1, 3], 3: [0, 2] };
  function w1b_clusterResponse(node) {
    if (prefersReducedMotion) return;
    var c = W1B_NODE_CLUSTER[node];
    if (c === undefined) c = -1;
    if (c === w1b_activeCluster) return;
    var ambient = document.getElementById("ambient");
    if (!ambient) return;
    // Clear previous active + semi-active
    if (w1b_activeCluster >= 0) {
      var prev = ambient.querySelectorAll('[data-c="' + w1b_activeCluster + '"]');
      for (var i = 0; i < prev.length; i++) prev[i].classList.remove("amb-active");
      var prevN = W2B_ADJACENT[w1b_activeCluster] || [];
      for (var n = 0; n < prevN.length; n++) {
        var prevS = ambient.querySelectorAll('[data-c="' + prevN[n] + '"]');
        for (var m = 0; m < prevS.length; m++) prevS[m].classList.remove("amb-semi");
      }
    }
    w1b_activeCluster = c;
    if (c >= 0) {
      var cur = ambient.querySelectorAll('[data-c="' + c + '"]');
      for (var j = 0; j < cur.length; j++) cur[j].classList.add("amb-active");
      // W2-B: propagate weaker response to adjacent clusters
      var adj = W2B_ADJACENT[c] || [];
      for (var k = 0; k < adj.length; k++) {
        var semi = ambient.querySelectorAll('[data-c="' + adj[k] + '"]');
        for (var s = 0; s < semi.length; s++) semi[s].classList.add("amb-semi");
      }
    }
  }

  // W1-B3: trail — sample spider XY via MutationObserver, render fading polyline.
  var w1b_trailPts = [];
  var w1b_trailEl = null;
  var w1b_trailFadeTimer = null;
  var w1b_lastTrailSample = 0;
  function w1b_renderTrail() {
    if (w1b_trailEl && w1b_trailEl.parentNode) w1b_trailEl.parentNode.removeChild(w1b_trailEl);
    w1b_trailEl = null;
    if (w1b_trailPts.length < 2 || prefersReducedMotion) return;
    var pts = w1b_trailPts.map(function (p) { return p.x.toFixed(1) + "," + p.y.toFixed(1); }).join(" ");
    var threads = document.getElementById("threads");
    if (!threads) return;
    w1b_trailEl = el("polyline", { points: pts, "class": "w1b-trail" }, threads.parentNode);
    threads.parentNode.insertBefore(w1b_trailEl, threads);
  }
  function w1b_initTrail() {
    if (prefersReducedMotion) return;
    var spiderEl = document.getElementById("spider");
    if (!spiderEl || !window.MutationObserver) return;
    var obs = new MutationObserver(function () {
      var now = performance.now();
      if (now - w1b_lastTrailSample < 120) return; // ~8Hz max
      w1b_lastTrailSample = now;
      var xy = spiderXY();
      var last = w1b_trailPts[w1b_trailPts.length - 1];
      if (last && Math.hypot(xy.x - last.x, xy.y - last.y) < 2) return; // no movement
      w1b_trailPts.push({ x: xy.x, y: xy.y });
      while (w1b_trailPts.length > 16) w1b_trailPts.shift(); // ~2s window
      w1b_renderTrail();
      if (w1b_trailFadeTimer) clearTimeout(w1b_trailFadeTimer);
      w1b_trailFadeTimer = setTimeout(function () {
        w1b_trailPts = [];
        w1b_renderTrail();
      }, 2500);
    });
    obs.observe(spiderEl, { attributes: true, attributeFilter: ["transform"] });
  }

  /* ---------- W1-C: Spatial Focus (camera) ----------
   * Visual only. Subtle pan + zoom following spider activity.
   * During journey: updated inside existing travelLegs frame() (no new rAF).
   * Idle return: bounded self-terminating rAF (stops when settled).
   * No locomotion change. Respects prefers-reduced-motion. No Math.random(). */
  var w1c_returnRaf = 0;
  var W1C_PAN = 0.28; // shift 28% towards spider (W1-C polish: more visible)
  var W1C_ZOOM = 1.11; // 11% zoom in when active (W1-C polish: more visible)

  function w1c_applyCamera() {
    if (prefersReducedMotion) {
      // Static safe framing
      svg.setAttribute("viewBox", w1c_baseVB.x + " " + w1c_baseVB.y + " " + w1c_baseVB.w + " " + w1c_baseVB.h);
      return;
    }
    var bw = w1c_baseVB.w, bh = w1c_baseVB.h;
    var w = bw / w1c_cam.zoom, h = bh / w1c_cam.zoom;
    // Focus point blended from base center towards target
    var bcx = w1c_baseVB.x + bw / 2, bcy = w1c_baseVB.y + bh / 2;
    var cx = bcx + (w1c_cam.fx - bcx) * W1C_PAN;
    var cy = bcy + (w1c_cam.fy - bcy) * W1C_PAN;
    svg.setAttribute("viewBox", (cx - w / 2).toFixed(1) + " " + (cy - h / 2).toFixed(1) + " " + w.toFixed(1) + " " + h.toFixed(1));
  }
  function w1c_setTarget(fx, fy, zoom) {
    if (prefersReducedMotion) return;
    w1c_target.fx = fx; w1c_target.fy = fy; w1c_target.zoom = zoom;
    // Cancel any return animation; journey frame loop will drive towards target
    if (w1c_returnRaf) { try { cancelAnimationFrame(w1c_returnRaf); } catch (e) {} w1c_returnRaf = 0; }
  }
  function w1c_updateCamera() {
    // Called from existing travelLegs frame(). Lerps towards target.
    if (prefersReducedMotion) return;
    var k = 0.07;
    w1c_cam.fx += (w1c_target.fx - w1c_cam.fx) * k;
    w1c_cam.fy += (w1c_target.fy - w1c_cam.fy) * k;
    w1c_cam.zoom += (w1c_target.zoom - w1c_cam.zoom) * k;
    w1c_applyCamera();
  }
  function w1c_returnHome() {
    // Bounded self-terminating return to home framing. Stops when settled.
    if (prefersReducedMotion) { w1c_applyCamera(); return; }
    w1c_target.fx = 600; w1c_target.fy = 400; w1c_target.zoom = 1;
    if (w1c_returnRaf) return; // already returning
    var step = function () {
      var k = 0.1;
      w1c_cam.fx += (w1c_target.fx - w1c_cam.fx) * k;
      w1c_cam.fy += (w1c_target.fy - w1c_cam.fy) * k;
      w1c_cam.zoom += (w1c_target.zoom - w1c_cam.zoom) * k;
      w1c_applyCamera();
      var d = Math.hypot(w1c_target.fx - w1c_cam.fx, w1c_target.fy - w1c_cam.fy) + Math.abs(w1c_target.zoom - w1c_cam.zoom) * 500;
      if (d > 1) {
        w1c_returnRaf = requestAnimationFrame(step);
      } else {
        w1c_cam.fx = 600; w1c_cam.fy = 400; w1c_cam.zoom = 1;
        w1c_applyCamera();
        w1c_returnRaf = 0;
      }
    };
    w1c_returnRaf = requestAnimationFrame(step);
  }

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

  /* ---------- L2: 8-leg alternating tetrapod gait ----------
   * Groups: A=[0,3,5,6], B=[1,2,4,7]. A supports while B steps, then swap.
   * Driven by actual body velocity; integrated into travelLegs frame loop.
   * No new permanent rAF. All poses via solveLegIK(). */
  var GROUP_A = [0, 3, 5, 6], GROUP_B = [1, 2, 4, 7];
  // L6-J: reduced motion — no gait animation, but position/rotation still correct
  var prefersReducedMotion = false;
  try {
    prefersReducedMotion = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}
  // L3: dynamic stride and cadence bounds
  var STRIDE_MIN = 4, STRIDE_MAX = 16; // IK-safe: max reach 55.5, home ~46
  var CADENCE_MIN = 0.5, CADENCE_MAX = 2.5; // cycles/sec, deterministic
  var VEL_THRESHOLD = 3;
  var gait = {
    active: false, cycle: 0, lastT: 0,
    prevX: 0, prevY: 0, hasPrev: false,
    vel: 0, velDir: { x: 0, y: -1 },
    tangentDeg: 0, // L3: explicit path tangent from frame()
    strideLen: 12, // L3: dynamic
    legs: [], // per-leg: {offset, phase, prevPhase, locked, liftOff, newPlant, cur}
    settleT: -1 // >=0 while settling back to home
  };
  for (var gi = 0; gi < 8; gi++) {
    var isA = GROUP_A.indexOf(gi) >= 0;
    var off = isA ? 0 : 0.5;
    gait.legs.push({ offset: off, phase: off, prevPhase: off,
                     locked: null, liftOff: null, newPlant: null,
                     cur: { hipD: 0, kneeD: 0, ankleD: 0 } });
  }

  var contactsG = null;
  function ensureContacts() {
    if (contactsG) return true;
    try {
      var svg = document.querySelector("svg");
      var spiderEl = document.getElementById("spider");
      if (!svg || !spiderEl) return false;
      contactsG = document.createElementNS("http://www.w3.org/2000/svg", "g");
      contactsG.setAttribute("id", "gaitContacts");
      for (var i = 0; i < 8; i++) {
        var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("r", "2.5");
        c.setAttribute("fill", "#d9a441");
        c.setAttribute("opacity", "0");
        contactsG.appendChild(c);
      }
      // Insert before spider so contacts are under it
      svg.insertBefore(contactsG, spiderEl);
      return true;
    } catch (e) { return false; }
  }

  function showContact(i, x, y) {
    if (prefersReducedMotion) return; // L6-J: no contact animation
    if (!ensureContacts()) return;
    var c = contactsG.children[i];
    if (!c) return;
    c.setAttribute("cx", x); c.setAttribute("cy", y);
    c.setAttribute("opacity", "0.9");
    // Fade out over 300ms via transition
    try { c.style.transition = "opacity 0.3s"; } catch (e) {}
    setTimeout(function () { try { c.setAttribute("opacity", "0"); } catch (e) {} }, 50);
  }

  function gaitPlantTarget(i) {
    var neutral = fkTipWorld(i);
    // L3: use explicit path tangent (handles reverse, arc curvature)
    var tr = gait.tangentDeg * Math.PI / 180;
    var tx = Math.cos(tr), ty = Math.sin(tr);
    return {
      x: neutral.x + tx * gait.strideLen * 0.5,
      y: neutral.y + ty * gait.strideLen * 0.5
    };
  }

  function updateGaitLeg(i, dt, cadence) {
    var L = gait.legs[i];
    var prevPhase = L.phase;
    L.prevPhase = prevPhase;
    // Advance phase
    L.phase = (L.phase + dt * cadence) % 1.0;
    var phase = L.phase;
    var target;

    if (phase < 0.6) {
      // SUPPORT: foot locked in world
      if (!L.locked) L.locked = fkTipWorld(i);
      // On wrap (phase < prevPhase), lock the new plant
      if (phase < prevPhase && L.newPlant) L.locked = L.newPlant;
      target = L.locked;
      setTipOpacity(i, "1");
    } else if (phase < 0.7) {
      // LIFT
      target = L.locked || fkTipWorld(i);
      setTipOpacity(i, "0.55");
    } else if (phase < 0.9) {
      // SWING
      if (prevPhase < 0.7) {
        L.liftOff = L.locked ? { x: L.locked.x, y: L.locked.y } : fkTipWorld(i);
        L.newPlant = gaitPlantTarget(i);
        L.swingTangent = gait.tangentDeg;
      } else {
        // L3: if tangent changed significantly mid-swing, update target
        // (prevents stale targets on curving arcs)
        var tDiff = Math.abs(gait.tangentDeg - L.swingTangent);
        if (tDiff > 180) tDiff = 360 - tDiff;
        if (tDiff > 15) {
          L.newPlant = gaitPlantTarget(i);
          L.swingTangent = gait.tangentDeg;
        }
      }
      var k = (phase - 0.7) / 0.2;
      var s = k * k * (3 - 2 * k);
      target = {
        x: L.liftOff.x + (L.newPlant.x - L.liftOff.x) * s,
        y: L.liftOff.y + (L.newPlant.y - L.liftOff.y) * s
      };
      setTipOpacity(i, "0.55");
    } else {
      // PLANT
      target = L.newPlant || L.locked || fkTipWorld(i);
      if (prevPhase < 0.9) showContact(i, target.x, target.y);
      setTipOpacity(i, "1");
    }

    var sol = solveLegIK(i, target);
    L.cur = { hipD: sol.hipDelta, kneeD: sol.kneeDelta, ankleD: sol.ankleDelta };
    setLegPose(i, sol.hipDelta, sol.kneeDelta, sol.ankleDelta);
  }

  function setTipOpacity(i, v) {
    var ankle = legEls[i].ankle;
    for (var j = 0; j < ankle.children.length; j++) {
      var c = ankle.children[j];
      if (c.getAttribute && c.getAttribute("class") === "tip") {
        c.setAttribute("opacity", v);
        break;
      }
    }
  }

  function updateGait(now, x, y, tangentDeg) {
    // L6-J: reduced motion — skip gait animation entirely.
    // Spider still follows path (position/rotation), legs stay in home pose.
    if (prefersReducedMotion) return;
    // Velocity from position delta
    var dt = 0.016;
    if (gait.hasPrev) {
      dt = Math.max(0.001, (now - gait.lastT) / 1000);
      var dx = x - gait.prevX, dy = y - gait.prevY;
      var dist = Math.hypot(dx, dy);
      gait.vel = dist / dt;
      if (dist > 0.01) gait.velDir = { x: dx / dist, y: dy / dist };
    }
    gait.prevX = x; gait.prevY = y;
    gait.lastT = now; gait.hasPrev = true;
    // L3: explicit tangent (from path, handles reverse/arc)
    if (typeof tangentDeg === "number" && isFinite(tangentDeg)) {
      gait.tangentDeg = tangentDeg;
    }

    if (gait.vel > VEL_THRESHOLD) {
      // Active gait
      if (gait.settleT >= 0) gait.settleT = -1; // cancel settle
      gait.active = true;
      // L3: dynamic stride from velocity, clamped to IK-safe range
      gait.strideLen = Math.max(STRIDE_MIN,
        Math.min(STRIDE_MAX, gait.vel * 0.12));
      // L3: cadence from velocity/stride, clamped deterministic
      var cadence = Math.max(CADENCE_MIN,
        Math.min(CADENCE_MAX, gait.vel / gait.strideLen));
      // Body motion: bob ±1.5, sway ±1, pitch ±1°
      var cyc = gait.cycle;
      var bob = 1.5 * Math.sin(cyc * Math.PI * 4);
      var sway = 1.0 * Math.sin(cyc * Math.PI * 2);
      var pitch = 1.0 * Math.sin(cyc * Math.PI * 2 + Math.PI / 2);
      // Apply to spider transform
      var tr = spider.getAttribute("transform") || "";
      var m = tr.match(/translate\(\s*([\d.e+-]+)[,\s]+([\d.e+-]+)\s*\)\s*rotate\(\s*([\d.e+-]+)\s*\)/);
      if (m) {
        var bx = parseFloat(m[1]) + sway, by = parseFloat(m[2]) + bob;
        var br = parseFloat(m[3]) + pitch;
        spider.setAttribute("transform",
          "translate(" + bx.toFixed(1) + "," + by.toFixed(1) + ") rotate(" + br.toFixed(1) + ")");
      }
      // Update cycle and legs
      gait.cycle = (gait.cycle + dt * cadence) % 1.0;
      for (var i = 0; i < 8; i++) updateGaitLeg(i, dt, cadence);
    } else {
      // Velocity low: settle back to home
      if (gait.active) {
        gait.active = false;
        gait.settleT = 0;
      }
      if (gait.settleT >= 0) {
        gait.settleT += dt;
        var k = Math.min(1, gait.settleT / 0.3);
        var s = k * k * (3 - 2 * k);
        for (var j = 0; j < 8; j++) {
          var Lc = gait.legs[j];
          var hd = Lc.cur.hipD * (1 - s), kd = Lc.cur.kneeD * (1 - s), ad = Lc.cur.ankleD * (1 - s);
          setLegPose(j, hd, kd, ad);
          setTipOpacity(j, "1");
        }
        if (k >= 1) {
          gait.settleT = -1;
          for (var m2 = 0; m2 < 8; m2++) {
            resetLegPose(m2);
            gait.legs[m2].locked = null;
            gait.legs[m2].phase = gait.legs[m2].offset; // reset to group offset
          }
        }
      }
    }
  }

  function resetGait() {
    gait.active = false;
    gait.cycle = 0;
    gait.hasPrev = false;
    gait.settleT = -1;
    gait.vel = 0;
    gait.hub.active = false;
    gait.hub.steps = [];
    gait.arrival.active = false;
    gait.arrival.done = false;
    gait.arrival.settleT = -1;
    for (var i = 0; i < 8; i++) {
      resetLegPose(i);
      setTipOpacity(i, "1");
      gait.legs[i].locked = null;
      gait.legs[i].phase = gait.legs[i].offset;
    }
  }

  /* ---------- L5: Arrival + micro-settle ----------
   * On journey completion: complete in-progress swings synchronously
   * (to natural positions, not home), lock all feet. No extra rAF frames —
   * done() fires on time to preserve 1152ms timing. */
  gait.arrival = { active: false, done: false, settleT: -1 };

  function startArrival() {
    // Synchronously complete all legs to SUPPORT with world-locked feet.
    // No teleport: each leg finishes to its natural target, not home.
    for (var i = 0; i < 8; i++) {
      var L = gait.legs[i];
      var target;
      if (L.phase >= 0.6) {
        // In LIFT/SWING/PLANT: complete to plant target
        target = L.newPlant || L.locked || fkTipWorld(i);
        L.locked = { x: target.x, y: target.y };
        showContact(i, target.x, target.y);
      } else {
        // In SUPPORT: keep locked
        target = L.locked || fkTipWorld(i);
        if (!L.locked) L.locked = { x: target.x, y: target.y };
      }
      L.phase = L.offset; // reset to group base
      var sol = solveLegIK(i, target);
      L.cur = { hipD: sol.hipDelta, kneeD: sol.kneeDelta, ankleD: sol.ankleDelta };
      setLegPose(i, sol.hipDelta, sol.kneeDelta, sol.ankleDelta);
      setTipOpacity(i, "1");
    }
    gait.active = false;
    gait.arrival.done = true;
    // Micro-settle: tiny CSS transition on spider (200ms, decaying)
    // Applied as a one-time class; no rAF needed.
    try {
      spider.style.transition = "transform 0.2s ease-out";
      setTimeout(function () { try { spider.style.transition = ""; } catch (e) {} }, 250);
    } catch (e) {}
  }

  function updateArrival(dt) {
    // No longer used (synchronous arrival). Kept for API compatibility.
  }

  /* ---------- L4: HUB turning mini-steps ----------
   * During the 100ms hub pause, proactively reposition 2-3 feet toward
   * the outgoing direction. No full gait cycle, no teleport. */
  gait.hub = { active: false, turnAngle: 0, outgoingTangent: 0, steps: [], stepT: 0 };

  function hubStartTurn(incomingDeg, outgoingDeg) {
    var diff = ((outgoingDeg - incomingDeg + 540) % 360) - 180; // shortest
    gait.hub.turnAngle = diff;
    gait.hub.outgoingTangent = outgoingDeg;
    // Only mini-step if turn is significant
    if (Math.abs(diff) < 25) return false;
    // Select 2 legs: front pair (one from each group) — most affected by turn
    // For larger turns (>90°), add a third leg
    var legs = [0, 4];
    if (Math.abs(diff) > 90) legs.push(1);
    // Mini-step: small nudge in outgoing direction (not full rotation)
    // Offset proportional to turn, clamped to 15 units max
    var outRad = outgoingDeg * Math.PI / 180;
    var outX = Math.cos(outRad), outY = Math.sin(outRad);
    var nudge = Math.min(15, Math.abs(diff) * 0.15);
    gait.hub.steps = [];
    legs.forEach(function (i) {
      var L = gait.legs[i];
      var from = L.locked ? { x: L.locked.x, y: L.locked.y } : fkTipWorld(i);
      var to = { x: from.x + outX * nudge, y: from.y + outY * nudge };
      gait.hub.steps.push({ leg: i, from: from, to: to, done: false });
    });
    gait.hub.active = true;
    gait.hub.stepT = 0;
    return true;
  }

  function hubUpdate(dt) {
    if (!gait.hub.active) return;
    if (prefersReducedMotion) { gait.hub.active = false; return; }
    gait.hub.stepT += dt;
    var t = Math.min(1, gait.hub.stepT / 0.08); // 80ms for mini-steps
    var s = t * t * (3 - 2 * t); // smoothstep
    var allDone = true;
    gait.hub.steps.forEach(function (step) {
      if (step.done) return;
      var target;
      if (t < 1) {
        target = {
          x: step.from.x + (step.to.x - step.from.x) * s,
          y: step.from.y + (step.to.y - step.from.y) * s
        };
        allDone = false;
      } else {
        target = step.to;
        step.done = true;
        // Lock the new position
        gait.legs[step.leg].locked = { x: step.to.x, y: step.to.y };
        showContact(step.leg, step.to.x, step.to.y);
      }
      var sol = solveLegIK(step.leg, target);
      gait.legs[step.leg].cur = { hipD: sol.hipDelta, kneeD: sol.kneeDelta, ankleD: sol.ankleDelta };
      setLegPose(step.leg, sol.hipDelta, sol.kneeDelta, sol.ankleDelta);
      setTipOpacity(step.leg, t < 1 ? "0.55" : "1");
    });
    if (allDone) gait.hub.active = false;
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
    w1b_clearActivePath(); // W1-B1: clear on cancel/retarget
    w1c_returnHome(); // W1-C: return to normal framing on cancel
    resetGait(); // L2: settle legs on cancel/retarget (no teleport)
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
      if (!item.leg) {
        legPath = null;
        // L4: hub pause entry — compute turn angle and start mini-steps
        var incoming = gait.tangentDeg;
        var nextItem = plan[i + 1];
        if (nextItem && nextItem.leg && nextItem.leg.path) {
          try {
            var np = nextItem.leg.path;
            var nrev = !!nextItem.leg.reverse;
            var nlen = np.getTotalLength();
            var np0 = np.getPointAtLength(nrev ? nlen : 0);
            var np1 = np.getPointAtLength(nrev ? Math.max(0, nlen - 4) : Math.min(nlen, 4));
            if (np0 && np1) {
              var outDeg = Math.atan2(np1.y - np0.y, np1.x - np0.x) * 180 / Math.PI;
              hubStartTurn(incoming, outDeg);
            }
          } catch (e) { /* no hub turn */ }
        }
        return;
      } // hub pause: hold position
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
          var tangentDeg = null;
          if (p2 && (Math.abs(p2.x - pt.x) > 0.01 || Math.abs(p2.y - pt.y) > 0.01)) {
            var dirDeg = Math.atan2(p2.y - pt.y, p2.x - pt.x) * 180 / Math.PI;
            tangentDeg = dirDeg; // L3: explicit path tangent (handles reverse)
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
          // L2/L3 gait: update from actual velocity + path tangent.
          updateGait(now, pt.x, pt.y, tangentDeg);
          w1c_updateCamera(); // W1-C: subtle focus follows during journey
        }
      } else {
        // Hub pause: L4 mini-steps if turning, else settle
        var xy2 = spiderXY();
        if (gait.hub.active) {
          var hdt = Math.max(0.001, (now - (gait.lastT || now)) / 1000);
          hubUpdate(hdt);
          gait.lastT = now;
        } else {
          updateGait(now, xy2.x, xy2.y, null);
        }
      }
      if (t >= 1) {
        if (legIdx + 1 >= plan.length) {
          // L5: synchronous arrival — complete swings to natural positions,
          // then done() on time (preserves 1152ms timing, no extra rAF).
          startArrival();
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
      w1b_setActivePath(from, node); // W1-B1: highlight actual route
      w1b_clusterResponse(node); // W1-B2: nearest ambient cluster reacts
      w1c_setTarget(p.x, p.y, W1C_ZOOM); // W1-C: focus on destination
      travelLegs(from, node, VISUAL_MIN_MS - 50, function (completed) {
        w1b_clearActivePath(); // W1-B1: clear on arrival
        w1c_returnHome(); // W1-C: ease back to normal framing
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
    "create_options": "RESULT",

    /* Task-management tools are TASK, not UNKNOWN. */
    "browser.spawn_task": "TASK", "browser.steer_task": "TASK",
    "browser.peek_task": "TASK", "browser.list_tasks": "TASK",
    "task.spawn": "TASK", "task.steer": "TASK",
    "task.peek": "TASK", "task.list": "TASK",

    /* Explicit connection/authentication actions. */
    "connect": "CONNECT", "browser.connect": "CONNECT",
    "auth": "CONNECT", "browser.auth": "CONNECT",
    "login": "CONNECT", "browser.login": "CONNECT",
    "oauth": "CONNECT", "browser.oauth": "CONNECT",
    "attach": "CONNECT", "browser.attach": "CONNECT",

    /* Explicit verification/validation actions. */
    "verify": "VERIFY", "browser.verify": "VERIFY",
    "validate": "VERIFY", "browser.validate": "VERIFY",
    "check": "VERIFY", "browser.check": "VERIFY"
  };

  function toolToNode(tool) {
    if (!tool) return "UNKNOWN";
    var key = String(tool).toLowerCase();
    if (TOOL_NODE[key]) return TOOL_NODE[key];

    /* Semantic fallbacks for tool names introduced later. */
    if (/(^|[._-])(spawn|steer|peek|list)_?task($|[._-])/.test(key) ||
        key.indexOf("task.") === 0) return "TASK";
    if (key.indexOf("connect") !== -1 || key.indexOf("auth") !== -1 ||
        key.indexOf("login") !== -1 || key.indexOf("oauth") !== -1 ||
        key.indexOf("attach") !== -1) return "CONNECT";
    if (key.indexOf("verify") !== -1 || key.indexOf("validate") !== -1 ||
        key.indexOf("check") !== -1) return "VERIFY";
    if (key.indexOf("analy") !== -1 || key.indexOf("reason") !== -1 ||
        key.indexOf("inspect") !== -1) return "ANALYZE";
    if (key.indexOf("result") !== -1 || key.indexOf("final") !== -1) return "RESULT";
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
    var tool = msg.tool;
    /* If telemetry arrives without a useful node (or explicitly UNKNOWN),
     * recover a semantic node from the tool name on the client. */
    var node = (msg.node && msg.node !== "UNKNOWN") ? msg.node : toolToNode(tool);
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
    _gait: function () { return gait; },
    _updateGait: updateGait,
    _resetGait: resetGait,
    _groups: function () { return { A: GROUP_A, B: GROUP_B }; },
    _hubStartTurn: hubStartTurn,
    _hubUpdate: hubUpdate,
    _startArrival: startArrival,
    _updateArrival: updateArrival,
    _journeyActive: function () { return !!journeyState; },
    _connectWs: connectWs };

  poll();
  setInterval(poll, POLL_MS);
  setInterval(function () { if (lastState) renderAge(lastState); }, 1000);
  setConn("CONNECTING");
  connectWs();
  w1b_initTrail(); // W1-B3: spider trail observer
})();
