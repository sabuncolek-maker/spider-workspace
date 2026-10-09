/* PULSAR — rebuild from zero.
 * Data pipeline preserved (WebSocket + state.json fallback + event protocol).
 * Visuals rewritten: spiral galaxy, pulsar core, energy beams. No IK, no walking.
 * Every visual is driven by real telemetry. No simulation.
 */
(function () {
"use strict";

var SVGNS = "http://www.w3.org/2000/svg";
var qs = new URLSearchParams(location.search);
var STATE_URL = qs.get("src") || "state.json";
var WS_URL = qs.get("ws") ||
  (location.protocol === "https:" ? "wss://" : "ws://") +
  "spider-realtime-poc.sabuncolek1508.workers.dev/ws";

var CX = 600, CY = 400; // galactic center

/* ---------- Tool -> node mapping (preserved) ---------- */
var TOOL_NODE = {
  "search": "SEARCH", "browser.search": "SEARCH", "browser_search": "SEARCH",
  "deep_research": "SEARCH",
  "open": "COLLECT", "browser.open": "COLLECT", "find": "COLLECT",
  "read": "COLLECT", "memory_search": "COLLECT", "memory_get": "COLLECT",
  "exec": "PROCESS", "write": "PROCESS", "edit": "PROCESS",
  "todo.write": "ANALYZE", "subagent.spawn": "ANALYZE",
  "create_options": "RESULT",
  "browser.spawn_task": "TASK", "browser.steer_task": "TASK",
  "browser.peek_task": "TASK", "browser.list_tasks": "TASK",
  "task.spawn": "TASK", "task.steer": "TASK",
  "task.peek": "TASK", "task.list": "TASK",
  "connect": "CONNECT", "browser.connect": "CONNECT",
  "auth": "CONNECT", "browser.auth": "CONNECT",
  "login": "CONNECT", "browser.login": "CONNECT",
  "oauth": "CONNECT", "browser.oauth": "CONNECT",
  "db": "VERIFY", "muse.db": "VERIFY"
};
function toolToNode(tool) {
  if (!tool) return "UNKNOWN";
  var key = String(tool).toLowerCase();
  if (TOOL_NODE[key]) return TOOL_NODE[key];
  if (key.indexOf("search") !== -1) return "SEARCH";
  if (key.indexOf("browser") !== -1) return "COLLECT";
  return "UNKNOWN";
}

var NODE_COLORS = {
  SEARCH: "#35e0ff", COLLECT: "#2dd4bf", PROCESS: "#ff4fd8",
  ANALYZE: "#a78bfa", RESULT: "#ffd166", COMPLETE: "#4ade80",
  ERROR: "#f87171", UNKNOWN: "#6f7683", TASK: "#ff9f43",
  VERIFY: "#60a5fa", CONNECT: "#f472b6"
};

/* ---------- Spiral galaxy layout (deterministic) ---------- */
var NODES = ["SEARCH","COLLECT","PROCESS","ANALYZE","RESULT","COMPLETE",
             "TASK","VERIFY","CONNECT","ERROR","UNKNOWN"];
var POS = {};
(function layoutSpiral() {
  // logarithmic spiral: r = a * e^(b*theta)
  var a = 120, b = 0.16;
  NODES.forEach(function (name, i) {
    var theta = i * (Math.PI * 2 / NODES.length) * 2.4; // ~2.4 turns spread
    var r = a * Math.exp(b * (i * 0.85));
    if (r > 340) r = 340; // clamp to viewBox
    POS[name] = {
      x: CX + r * Math.cos(theta),
      y: CY + r * Math.sin(theta) * 0.72, // squash for widescreen
      depth: i / NODES.length // 0 = near center, 1 = far
    };
  });
})();

/* ---------- DOM helpers ---------- */
function el(tag, attrs, parent) {
  var n = document.createElementNS(SVGNS, tag);
  if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
  if (parent) parent.appendChild(n);
  return n;
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

/* ---------- Build scene ---------- */
var nodesG = document.getElementById("nodes");
var beamsG = document.getElementById("beams");
var armsG = document.getElementById("spiralArms");
var pulsarEl = document.getElementById("pulsar");
var ringsG = document.getElementById("rings");
var nodeEls = {};

// faint spiral arms
(function drawArms() {
  for (var arm = 0; arm < 2; arm++) {
    var d = "";
    for (var t = 0; t <= 40; t++) {
      var th = (t / 40) * Math.PI * 3 + arm * Math.PI;
      var r = 90 + (t / 40) * 260;
      var x = CX + r * Math.cos(th), y = CY + r * Math.sin(th) * 0.72;
      d += (t === 0 ? "M " : " L ") + x.toFixed(1) + " " + y.toFixed(1);
    }
    el("path", { d: d }, armsG);
  }
})();

// nodes as stars
NODES.forEach(function (name) {
  var p = POS[name];
  var color = NODE_COLORS[name] || "#888";
  var size = 14 - p.depth * 6; // far = smaller
  var g = el("g", { "class": "node", id: "node-" + name }, nodesG);
  // glow
  el("circle", { cx: p.x, cy: p.y, r: size * 2.2, fill: "url(#nodeGlow)",
    opacity: 0.35, style: "color:" + color }, g);
  // orb
  el("circle", { "class": "node-orb", cx: p.x, cy: p.y, r: size,
    fill: "#0b0f1a", stroke: color, "stroke-width": 1.6,
    style: "color:" + color }, g);
  // label
  var label = el("text", { "class": "node-label", x: p.x, y: p.y + size + 18 }, g);
  label.textContent = name;
  nodeEls[name] = g;
});

// ambient particles
(function particles() {
  var pg = document.getElementById("particles");
  var colors = ["#ffffff", "#aef4ff", "#ffc7ec"];
  for (var i = 0; i < 130; i++) {
    el("circle", {
      cx: (Math.random() * 1200).toFixed(0),
      cy: (Math.random() * 800).toFixed(0),
      r: (0.5 + Math.random() * 1.4).toFixed(1),
      fill: colors[i % 3],
      style: "animation-delay:" + (Math.random() * 4).toFixed(2) + "s"
    }, pg);
  }
})();

/* ---------- Pulsar rings (heartbeat) ---------- */
setInterval(function () {
  if (document.hidden) return;
  var c = el("circle", { "class": "pulsar-ring", cx: 0, cy: 0, r: 34 }, ringsG);
  setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 3200);
}, 3000);

/* ---------- Energy beams: core fires at active node ---------- */
var activeNode = null;
function fireBeam(node) {
  // JELLYFISH era: creature swims to node; node flares. No SVG beams.
  setActiveNode(node);
}
function setActiveNode(node) {
  if (activeNode && nodeEls[activeNode]) nodeEls[activeNode].setAttribute("class", "node");
  activeNode = node;
  if (nodeEls[node]) nodeEls[node].setAttribute("class", "node active");
}

/* ---------- Readout + feed ---------- */
function setRo(id, v) { var n = document.getElementById(id); if (n) n.innerHTML = v; }
var feedList = document.getElementById("feedList");
function addFeed(time, text, cls) {
  var li = document.createElement("li");
  if (cls) li.className = cls;
  li.innerHTML = '<span class="t">' + esc(time) + '</span><span class="dot"></span><span>' + esc(text) + '</span>';
  feedList.insertBefore(li, feedList.firstChild);
  while (feedList.children.length > 14) feedList.removeChild(feedList.lastChild);
}
function fmtTime(ts) {
  try { var d = new Date(ts); return d.toTimeString().slice(0, 8); }
  catch (e) { return "--:--:--"; }
}

/* ---------- Event pipeline (preserved protocol) ---------- */
var visualQueue = [];
var pumping = false;
var lastEventTs = 0;
var seenEvents = {};

function pumpQueue() {
  if (pumping) return;
  var item = visualQueue.shift();
  if (!item) return;
  pumping = true;
  // Pulsar fires beam — no travel time, instant but paced
  fireBeam(item.node);
  setRo("roNode", esc(item.node));
  setRo("roTool", esc(item.tool || "—"));
  setRo("roLatest", esc(item.tool || "—") + " · " + fmtTime(item.ts));
  setTimeout(function () {
    pumping = false;
    pumpQueue();
  }, 1200); // visual pacing slot
}

function handleMessage(msg) {
  if (!msg || typeof msg !== "object") return false;
  var eid = msg.event_id;
  if (eid) {
    if (seenEvents[eid]) return true;
    seenEvents[eid] = 1;
    var keys = Object.keys(seenEvents);
    if (keys.length > 500) delete seenEvents[keys[0]];
  }
  var et = msg.event_type;
  var tool = msg.tool;
  var ts = msg.timestamp || Date.now();
  var node = (msg.node && msg.node !== "UNKNOWN") ? msg.node : toolToNode(tool);
  var isSystem = tool === "db" || tool === "muse.db";

  if (et === "TOOL_STARTED") {
    if (isSystem) return true;
    lastEventTs = Date.now();
    visualQueue.push({ node: node, tool: tool, ts: ts });
    addFeed(fmtTime(ts), node + " · " + tool, "");
    setRo("roAgent", "WORKING");
    pumpQueue();
    return true;
  }
  if (et === "TOOL_COMPLETED" || et === "TOOL_FAILED") {
    var ok = msg.success !== false;
    if (tool && !isSystem) {
      addFeed(fmtTime(ts), node + " " + (ok ? "DONE" : "FAILED") + " (" + tool + ")",
              ok ? "succ" : "fail");
    }
    if (!ok && !isSystem) {
      visualQueue.push({ node: "ERROR", tool: tool, ts: ts });
      pumpQueue();
    }
    return true;
  }
  if (et === "TASK_STARTED" || et === "TASK_COMPLETED") {
    var tn = et === "TASK_STARTED" ? "TASK" : "COMPLETE";
    visualQueue.push({ node: tn, tool: tool || "task", ts: ts });
    addFeed(fmtTime(ts), tn + " · " + (msg.task || "task"),
            et === "TASK_COMPLETED" ? "succ" : "");
    setRo("roTask", esc(msg.task || "—"));
    pumpQueue();
    return true;
  }
  return false;
}

/* ---------- State.json fallback poll ---------- */
var lastStateTs = 0;
var wsLive = false;
function pollState() {
  fetch(STATE_URL, { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (st) {
      if (!st) return;
      var ts = st.timestamp || st.updated_at || 0;
      if (ts <= lastStateTs) return;
      lastStateTs = ts;
      // derive node from latest tool (only when WS is not live, to avoid double-fire)
      var tool = (st.latest_tool || st.tool || "");
      if (wsLive) tool = "";
      if (tool && tool !== "db" && tool !== "muse.db") {
        var node = toolToNode(tool);
        visualQueue.push({ node: node, tool: tool, ts: ts });
        addFeed(fmtTime(ts), node + " · " + tool + " (snapshot)", "");
        pumpQueue();
      }
      if (st.task) setRo("roTask", esc(st.task));
      updateStale(ts);
    })
    .catch(function () {});
}
function updateStale(ts) {
  var age = Date.now() - new Date(ts).getTime();
  var badge = document.getElementById("snapBadge");
  if (age > 180000) {
    badge.textContent = "STALE SNAPSHOT";
    badge.style.background = "rgba(248,113,113,0.12)";
    badge.style.color = "#f87171";
    badge.style.borderColor = "rgba(248,113,113,0.25)";
  } else {
    badge.textContent = "SNAPSHOT OK";
    badge.style.background = "";
    badge.style.color = "";
    badge.style.borderColor = "";
  }
}

/* ---------- WebSocket ---------- */
var socket = null;
var connDot = document.getElementById("connDot");
var connText = document.getElementById("connText");
var wsFailed = 0;

function setConn(state, text) {
  connDot.className = state;
  connText.textContent = text;
}
function connect() {
  try { socket = new WebSocket(WS_URL); } catch (e) { scheduleReconnect(); return; }
  socket.onopen = function () {
    wsFailed = 0;
    wsLive = true;
    setConn("live", "LIVE · WebSocket");
  };
  socket.onmessage = function (ev) {
    try { handleMessage(JSON.parse(ev.data)); }
    catch (e) {}
  };
  socket.onclose = function () { scheduleReconnect(); };
  socket.onerror = function () {
    try { socket.close(); } catch (e) {}
  };
}
function scheduleReconnect() {
  wsLive = false;
  wsFailed++;
  setConn(wsFailed > 2 ? "dead" : "", wsFailed > 2 ? "FALLBACK · polling state.json" : "reconnecting…");
  setTimeout(connect, Math.min(5000 * wsFailed, 30000));
}

// freshness: STALE if no valid TOOL_STARTED for 60s
setInterval(function () {
  if (lastEventTs && Date.now() - lastEventTs > 60000) {
    setRo("roAgent", "IDLE");
  }
}, 5000);

/* ---------- JELLYFISH: Muse as a cosmic creature ---------- */
var jCanvas = document.getElementById("tendrilCanvas");
var jCtx = jCanvas.getContext("2d");
function svgToScreen(sx, sy) {
  var scale = Math.min(innerWidth / 1200, innerHeight / 800);
  var ox = (innerWidth - 1200 * scale) / 2;
  var oy = (innerHeight - 800 * scale) / 2;
  return { x: ox + sx * scale, y: oy + sy * scale };
}

var jelly = {
  x: 0, y: 0,           // screen coords
  tx: 0, ty: 0,         // target
  vx: 0, vy: 0,
  bellPhase: 0,         // pulse cycle
  pulseAmp: 1,          // stronger when moving
  heading: 0,           // movement direction
  tentacles: []
};
var J_TENTACLES = 12;

function sizeJellyCanvas() {
  var dpr = window.devicePixelRatio || 1;
  jCanvas.width = innerWidth * dpr;
  jCanvas.height = innerHeight * dpr;
  jCanvas.style.width = innerWidth + "px";
  jCanvas.style.height = innerHeight + "px";
  jCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function jwobble(x, y, t) {
  var a = Math.sin(0.3 * x + 1.4 * t + 2.0 + 2.5 * Math.sin(0.4 * y - 1.3 * t + 1.0));
  var b = Math.sin(0.2 * y + 1.5 * t + 2.8 + 2.3 * Math.sin(0.5 * x - 1.2 * t + 0.5));
  return a + b;
}
function initJelly() {
  var pc = svgToScreen(CX, CY);
  jelly.x = pc.x; jelly.y = pc.y;
  jelly.tx = pc.x; jelly.ty = pc.y;
  jelly.tentacles = [];
  for (var i = 0; i < J_TENTACLES; i++) {
    jelly.tentacles.push({
      spread: (i / J_TENTACLES - 0.5) * 1.6,  // fan below bell
      len: 90 + Math.random() * 70,
      phase: Math.random() * 10,
      width: 1.2 + Math.random() * 1.4
    });
  }
}
// creature swims toward active node
function jellySwimTo(node) {
  var p = POS[node];
  if (!p) return;
  var pn = svgToScreen(p.x, p.y);
  // stop short of node (hover near, not on top)
  var pc = { x: jelly.x, y: jelly.y };
  var dx = pn.x - pc.x, dy = pn.y - pc.y;
  var d = Math.hypot(dx, dy) || 1;
  var hover = 70;
  jelly.tx = pn.x - dx / d * hover;
  jelly.ty = pn.y - dy / d * hover;
  jelly.pulseAmp = 1.8; // excited
  setTimeout(function () { jelly.pulseAmp = 1; }, 2500);
}
function drawJelly(time) {
  jCtx.clearRect(0, 0, innerWidth, innerHeight);
  // --- movement: smooth swim ---
  var dx = jelly.tx - jelly.x, dy = jelly.ty - jelly.y;
  var dist = Math.hypot(dx, dy);
  if (dist > 2) {
    jelly.heading = Math.atan2(dy, dx);
    var speed = Math.min(3.2, dist * 0.045) * jelly.pulseAmp;
    jelly.x += Math.cos(jelly.heading) * speed;
    jelly.y += Math.sin(jelly.heading) * speed;
  } else {
    // idle drift
    jelly.x += Math.sin(time * 0.5) * 0.3;
    jelly.y += Math.cos(time * 0.4) * 0.25;
  }
  // --- bell pulse ---
  jelly.bellPhase += 0.06 * jelly.pulseAmp;
  var pulse = Math.sin(jelly.bellPhase);
  var bellR = 34 * (1 + pulse * 0.10);
  var bellH = 30 * (1 - pulse * 0.14); // squashes when pulsing
  // bell faces movement direction; tentacles trail behind
  var faceAng = dist > 2 ? jelly.heading : -Math.PI / 2;
  jCtx.save();
  jCtx.translate(jelly.x, jelly.y);
  jCtx.rotate(faceAng + Math.PI / 2);
  // tentacles (trail behind = downward in local space)
  for (var k = 0; k < jelly.tentacles.length; k++) {
    var t = jelly.tentacles[k];
    var segs = 36;
    jCtx.beginPath();
    for (var i = 0; i <= segs; i++) {
      var f = i / segs;
      var bx = Math.sin(t.spread) * 14; // base across bell rim
      var r = f * t.len * (1 + pulse * 0.06);
      var sway = jwobble(bx * 0.05, f * 8, time * 0.8 + t.phase) * 10 * f;
      var x = bx + sway + Math.sin(t.spread) * f * 20;
      var y = bellH * 0.5 + r;
      if (i === 0) jCtx.moveTo(bx, bellH * 0.4);
      else jCtx.lineTo(x, y);
    }
    var grad = jCtx.createLinearGradient(0, 0, 0, t.len);
    grad.addColorStop(0, "rgba(216,249,255,0.85)");
    grad.addColorStop(0.4, "rgba(53,224,255,0.55)");
    grad.addColorStop(1, "rgba(180,79,216,0)");
    jCtx.strokeStyle = grad;
    jCtx.lineWidth = t.width;
    jCtx.lineCap = "round";
    jCtx.shadowColor = "rgba(53,224,255,0.7)";
    jCtx.shadowBlur = 8;
    jCtx.stroke();
    jCtx.shadowBlur = 0;
  }
  // bell dome
  var bellGrad = jCtx.createRadialGradient(0, -8, 4, 0, 0, bellR * 1.4);
  bellGrad.addColorStop(0, "rgba(255,255,255,0.95)");
  bellGrad.addColorStop(0.35, "rgba(216,249,255,0.75)");
  bellGrad.addColorStop(0.7, "rgba(53,224,255,0.35)");
  bellGrad.addColorStop(1, "rgba(53,224,255,0)");
  jCtx.beginPath();
  jCtx.ellipse(0, 0, bellR, bellH, 0, Math.PI, 0); // top dome
  jCtx.fillStyle = bellGrad;
  jCtx.shadowColor = "rgba(53,224,255,0.9)";
  jCtx.shadowBlur = 24;
  jCtx.fill();
  jCtx.shadowBlur = 0;
  // inner glow core
  jCtx.beginPath();
  jCtx.arc(0, -4, 10 + pulse * 2, 0, Math.PI * 2);
  jCtx.fillStyle = "rgba(255,255,255,0.9)";
  jCtx.shadowColor = "rgba(255,255,255,1)";
  jCtx.shadowBlur = 16;
  jCtx.fill();
  jCtx.shadowBlur = 0;
  jCtx.restore();
  requestAnimationFrame(function (ts) { drawJelly(ts / 1000); });
}
// hook: creature swims on activity
var _fireBeam2 = fireBeam;
fireBeam = function (node) {
  jellySwimTo(node);
  _fireBeam2(node);
};

/* ---------- Boot ---------- */
connect();
sizeJellyCanvas();
initJelly();
drawJelly(0);
window.addEventListener("resize", function () { sizeJellyCanvas(); initJelly(); });
setInterval(pollState, 7000);
pollState();
setRo("roAgent", "IDLE");
addFeed(fmtTime(Date.now()), "pulsar online · awaiting telemetry", "");

})();
