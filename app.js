/* SWARM — rebuild from zero.
 * 1. Crawlers leave living trails (persistent network graph)
 * 2. Swarm, not individual (sprites multiply with workload)
 * 3. Realtime stats (TOOLS / NODES / TRAILS / KEPT / SKIPPED)
 * 4. Brain (evaluates every tool: KEPT or SKIPPED)
 * Data protocol preserved. No simulation — every visual from real telemetry.
 */
(function () {
"use strict";

/* ---------- Config ---------- */
var qs = new URLSearchParams(location.search);
var STATE_URL = qs.get("src") || "state.json";
var WS_URL = qs.get("ws") ||
  (location.protocol === "https:" ? "wss://" : "ws://") +
  "spider-realtime-poc.sabuncolek1508.workers.dev/ws";

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
  "task.spawn": "TASK", "task.steer": "TASK", "task.peek": "TASK", "task.list": "TASK",
  "connect": "CONNECT", "browser.connect": "CONNECT", "auth": "CONNECT",
  "browser.auth": "CONNECT", "login": "CONNECT", "browser.login": "CONNECT",
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
var NODES = Object.keys(NODE_COLORS);

/* ---------- Canvas ---------- */
var cv = document.getElementById("swarmCanvas");
var ctx = cv.getContext("2d");
var W = 0, H = 0, DPR = 1;
function sizeCanvas() {
  DPR = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  cv.style.width = W + "px"; cv.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  layoutNodes();
}

/* ---------- Node layout: spiral (deterministic, normalized) ---------- */
var nodePos = {}; // name -> {x, y} in pixels
function layoutNodes() {
  var cx = W / 2, cy = H / 2 + 20;
  var maxR = Math.min(W, H) * 0.38;
  NODES.forEach(function (name, i) {
    var theta = i * 2.4; // golden-ish spread
    var r = maxR * (0.25 + 0.75 * (i / (NODES.length - 1)));
    nodePos[name] = {
      x: cx + r * Math.cos(theta),
      y: cy + r * Math.sin(theta) * 0.75,
      visits: (nodePos[name] && nodePos[name].visits) || 0
    };
  });
  // jelly home near center
  jelly.hx = cx; jelly.hy = cy;
}

/* ---------- State ---------- */
var stats = { tools: 0, nodes: {}, trails: 0, kept: 0, skipped: 0 };
var links = []; // {a, b, strength, age}
var trails = []; // {pts: [{x,y}], life, color}
var sprites = [];
var seenEvents = {};
var activeNode = null, activeUntil = 0;

/* ---------- Jellyfish (the creature = Muse) ---------- */
var jelly = {
  x: 0, y: 0, tx: 0, ty: 0, hx: 0, hy: 0,
  bellPhase: 0, pulseAmp: 1, heading: -Math.PI / 2,
  tentacles: []
};
function initJelly() {
  jelly.x = jelly.hx; jelly.y = jelly.hy;
  jelly.tx = jelly.hx; jelly.ty = jelly.hy;
  jelly.tentacles = [];
  for (var i = 0; i < 12; i++) {
    jelly.tentacles.push({
      spread: (i / 12 - 0.5) * 1.7,
      len: 80 + Math.random() * 60,
      phase: Math.random() * 10,
      width: 1.1 + Math.random() * 1.3
    });
  }
}
function wob(x, y, t) {
  return Math.sin(0.3 * x + 1.4 * t + 2 + 2.5 * Math.sin(0.4 * y - 1.3 * t + 1)) +
         Math.sin(0.2 * y + 1.5 * t + 2.8 + 2.3 * Math.sin(0.5 * x - 1.2 * t + 0.5));
}

/* ---------- Brain: evaluate every tool ---------- */
var brainEl = document.querySelector(".stat.brain");
var brainText = document.getElementById("brainText");
var brainTimer = 0;
function brainJudge(tool, node) {
  var isSystem = tool === "db" || tool === "muse.db";
  var verdict = isSystem ? "SKIPPED" : "KEPT";
  if (isSystem) stats.skipped++; else stats.kept++;
  updateStats();
  brainEl.className = "stat brain " + verdict.toLowerCase();
  brainText.textContent = (isSystem ? "SKIP " : "KEEP ") + String(tool).slice(0, 14);
  clearTimeout(brainTimer);
  brainTimer = setTimeout(function () {
    brainEl.className = "stat brain";
    brainText.textContent = "BRAIN IDLE";
  }, 1800);
  return !isSystem;
}

/* ---------- Sprites: swarm workers ---------- */
function spawnSprites(node, count) {
  var p = nodePos[node];
  if (!p) return;
  for (var i = 0; i < count; i++) {
    sprites.push({
      x: jelly.x + (Math.random() - 0.5) * 30,
      y: jelly.y + (Math.random() - 0.5) * 30,
      tx: p.x + (Math.random() - 0.5) * 24,
      ty: p.y + (Math.random() - 0.5) * 24,
      speed: 5 + Math.random() * 4,
      life: 1, decay: 0.008 + Math.random() * 0.008,
      trail: [], color: NODE_COLORS[node] || "#35e0ff",
      phase: Math.random() * 10
    });
  }
}

/* ---------- Trails: living, persistent ---------- */
function addTrail(x1, y1, x2, y2, color) {
  var pts = [];
  var segs = 16;
  for (var i = 0; i <= segs; i++) {
    var f = i / segs;
    pts.push({ x: x1 + (x2 - x1) * f, y: y1 + (y2 - y1) * f });
  }
  trails.push({ pts: pts, life: 1, color: color });
  stats.trails++;
  if (trails.length > 400) trails.shift(); // cap
}

/* ---------- Links: network graph that grows ---------- */
function addLink(a, b) {
  for (var i = 0; i < links.length; i++) {
    if ((links[i].a === a && links[i].b === b) || (links[i].a === b && links[i].b === a)) {
      links[i].strength = Math.min(1, links[i].strength + 0.25);
      links[i].age = 0;
      return;
    }
  }
  links.push({ a: a, b: b, strength: 0.3, age: 0 });
}

/* ---------- Stats DOM ---------- */
function updateStats() {
  document.getElementById("stTools").textContent = stats.tools;
  document.getElementById("stNodes").textContent = Object.keys(stats.nodes).length;
  document.getElementById("stTrails").textContent = stats.trails;
  document.getElementById("stKept").textContent = stats.kept;
  document.getElementById("stSkipped").textContent = stats.skipped;
}

/* ---------- Feed ---------- */
var feedList = document.getElementById("feedList");
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
function fmtT(ts) {
  try { return new Date(ts).toTimeString().slice(0, 8); } catch (e) { return "--:--:--"; }
}
function addFeed(text, cls) {
  var li = document.createElement("li");
  if (cls) li.className = cls;
  li.innerHTML = '<span class="t">' + fmtT(Date.now()) + "</span><span>" + esc(text) + "</span>";
  feedList.insertBefore(li, feedList.firstChild);
  while (feedList.children.length > 12) feedList.removeChild(feedList.lastChild);
}

/* ---------- Event pipeline ---------- */
function onToolStarted(tool, node, ts) {
  stats.tools++;
  stats.nodes[node] = (stats.nodes[node] || 0) + 1;
  if (nodePos[node]) nodePos[node].visits++;
  updateStats();
  // jellyfish swims toward node
  var p = nodePos[node];
  if (p) {
    var dx = p.x - jelly.x, dy = p.y - jelly.y;
    var d = Math.hypot(dx, dy) || 1;
    jelly.tx = p.x - dx / d * 80;
    jelly.ty = p.y - dy / d * 80;
    jelly.pulseAmp = 1.7;
    setTimeout(function () { jelly.pulseAmp = 1; }, 2200);
  }
  // swarm sprites
  spawnSprites(node, 2 + Math.floor(Math.random() * 2));
  // trail from jelly to node
  if (p) addTrail(jelly.x, jelly.y, p.x, p.y, NODE_COLORS[node] || "#35e0ff");
  // link jelly-home to node (network grows)
  addLink("JELLY", node);
  activeNode = node;
  activeUntil = performance.now() + 2500;
  addFeed(node + " · " + tool, "kept-row");
}
function onToolFailed(tool, node) {
  spawnSprites("ERROR", 3);
  addFeed("ERROR · " + tool + " failed", "");
}

function handleMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  var eid = msg.event_id;
  if (eid) {
    if (seenEvents[eid]) return;
    seenEvents[eid] = 1;
    var ks = Object.keys(seenEvents);
    if (ks.length > 500) delete seenEvents[ks[0]];
  }
  var et = msg.event_type, tool = msg.tool;
  var ts = msg.timestamp || Date.now();
  var node = (msg.node && msg.node !== "UNKNOWN") ? msg.node : toolToNode(tool);

  if (et === "TOOL_STARTED") {
    var kept = brainJudge(tool, node);
    if (!kept) { addFeed("skip · " + tool + " (system)", "skip-row"); return; }
    onToolStarted(tool, node, ts);
  } else if (et === "TOOL_COMPLETED" || et === "TOOL_FAILED") {
    var ok = msg.success !== false;
    if (!ok && tool !== "db" && tool !== "muse.db") onToolFailed(tool, node);
  } else if (et === "TASK_STARTED" || et === "TASK_COMPLETED") {
    var tn = et === "TASK_STARTED" ? "TASK" : "COMPLETE";
    brainJudge(tool || "task", tn);
    onToolStarted(tool || "task", tn, ts);
  }
}

/* ---------- WebSocket + fallback ---------- */
var connDot = document.getElementById("connDot");
var connText = document.getElementById("connText");
var wsLive = false, wsFail = 0, lastStateTs = 0;
function setConn(cls, txt) { connDot.className = cls; connText.textContent = txt; }
function connect() {
  var s;
  try { s = new WebSocket(WS_URL); } catch (e) { reconnect(); return; }
  s.onopen = function () { wsFail = 0; wsLive = true; setConn("live", "LIVE"); };
  s.onmessage = function (ev) { try { handleMessage(JSON.parse(ev.data)); } catch (e) {} };
  s.onclose = function () { reconnect(); };
  s.onerror = function () { try { s.close(); } catch (e) {} };
}
function reconnect() {
  wsLive = false; wsFail++;
  setConn(wsFail > 2 ? "dead" : "", wsFail > 2 ? "FALLBACK" : "reconnecting");
  setTimeout(connect, Math.min(5000 * wsFail, 30000));
}
function pollState() {
  fetch(STATE_URL, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (st) {
      if (!st) return;
      var ts = st.timestamp || st.updated_at || 0;
      if (ts <= lastStateTs) return;
      lastStateTs = ts;
      if (wsLive) return;
      var tool = st.latest_tool || st.tool || "";
      if (tool && tool !== "db" && tool !== "muse.db") {
        if (brainJudge(tool, toolToNode(tool))) onToolStarted(tool, toolToNode(tool), ts);
      }
    }).catch(function () {});
}

/* ---------- Render loop ---------- */
function draw(time) {
  ctx.clearRect(0, 0, W, H);
  var now = performance.now();

  // 1. trails (persistent, slow fade)
  for (var i = trails.length - 1; i >= 0; i--) {
    var tr = trails[i];
    tr.life -= 0.0012;
    if (tr.life <= 0) { trails.splice(i, 1); continue; }
    ctx.beginPath();
    tr.pts.forEach(function (pt, j) {
      if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    });
    ctx.strokeStyle = hexA(tr.color, 0.28 * tr.life);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // 2. links (network graph)
  for (var l = 0; l < links.length; l++) {
    var lk = links[l];
    lk.age += 0.001;
    var pa = lk.a === "JELLY" ? { x: jelly.hx, y: jelly.hy } : nodePos[lk.a];
    var pb = nodePos[lk.b];
    if (!pa || !pb) continue;
    var fade = Math.max(0.12, 1 - lk.age * 0.05);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.strokeStyle = hexA(NODE_COLORS[lk.b] || "#35e0ff", 0.22 * lk.strength * fade + 0.05);
    ctx.lineWidth = 1 + lk.strength * 1.6;
    ctx.stroke();
  }

  // 3. nodes
  var act = now < activeUntil ? activeNode : null;
  NODES.forEach(function (name) {
    var p = nodePos[name];
    var color = NODE_COLORS[name];
    var isAct = name === act;
    var r = 10 + Math.min(p.visits * 1.2, 10) + (isAct ? 5 * Math.abs(Math.sin(time * 4)) : 0);
    // glow
    var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
    g.addColorStop(0, hexA(color, isAct ? 0.55 : 0.25));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 3, 0, 7); ctx.fill();
    // orb
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7);
    ctx.fillStyle = "#0a0e1a";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = isAct ? 2.6 : 1.4;
    ctx.shadowColor = color; ctx.shadowBlur = isAct ? 18 : 7;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // label
    ctx.fillStyle = isAct ? "#fff" : "rgba(160,170,190,0.75)";
    ctx.font = "10px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText(name, p.x, p.y + r + 16);
  });

  // 4. sprites (swarm workers)
  for (var s = sprites.length - 1; s >= 0; s--) {
    var sp = sprites[s];
    var dx = sp.tx - sp.x, dy = sp.ty - sp.y;
    var d = Math.hypot(dx, dy);
    if (d > 4) {
      sp.x += dx / d * sp.speed;
      sp.y += dy / d * sp.speed;
      sp.trail.push({ x: sp.x, y: sp.y });
      if (sp.trail.length > 14) sp.trail.shift();
    } else {
      sp.life -= sp.decay * 3;
    }
    sp.life -= sp.decay * 0.4;
    if (sp.life <= 0) { sprites.splice(s, 1); continue; }
    // trail
    if (sp.trail.length > 1) {
      ctx.beginPath();
      sp.trail.forEach(function (pt, j) {
        if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      });
      ctx.strokeStyle = hexA(sp.color, 0.5 * sp.life);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    // body
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 3.2, 0, 7);
    ctx.fillStyle = hexA("#ffffff", 0.9 * sp.life);
    ctx.shadowColor = sp.color; ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 5. jellyfish (main creature)
  drawJelly(time);

  requestAnimationFrame(draw);
}

function drawJelly(time) {
  var dx = jelly.tx - jelly.x, dy = jelly.ty - jelly.y;
  var dist = Math.hypot(dx, dy);
  if (dist > 3) {
    jelly.heading = Math.atan2(dy, dx);
    var sp = Math.min(3.4, dist * 0.05) * jelly.pulseAmp;
    jelly.x += Math.cos(jelly.heading) * sp;
    jelly.y += Math.sin(jelly.heading) * sp;
  } else {
    // drift home slowly when idle
    var hx = jelly.hx - jelly.x, hy = jelly.hy - jelly.y;
    var hd = Math.hypot(hx, hy);
    if (hd > 30) { jelly.x += hx / hd * 0.4; jelly.y += hy / hd * 0.4; }
    jelly.x += Math.sin(time * 0.5) * 0.25;
    jelly.y += Math.cos(time * 0.4) * 0.2;
  }
  jelly.bellPhase += 0.055 * jelly.pulseAmp;
  var pulse = Math.sin(jelly.bellPhase);
  var bellR = 36 * (1 + pulse * 0.1);
  var bellH = 32 * (1 - pulse * 0.13);
  var face = dist > 3 ? jelly.heading : -Math.PI / 2;

  ctx.save();
  ctx.translate(jelly.x, jelly.y);
  ctx.rotate(face + Math.PI / 2);
  // tentacles
  jelly.tentacles.forEach(function (t) {
    ctx.beginPath();
    var segs = 30;
    for (var i = 0; i <= segs; i++) {
      var f = i / segs;
      var bx = Math.sin(t.spread) * 15;
      var r = f * t.len * (1 + pulse * 0.05);
      var sway = wob(bx * 0.06, f * 9, time * 0.9 + t.phase) * 11 * f;
      var x = bx + sway + Math.sin(t.spread) * f * 22;
      var y = bellH * 0.45 + r;
      if (i === 0) ctx.moveTo(bx, bellH * 0.4); else ctx.lineTo(x, y);
    }
    var tg = ctx.createLinearGradient(0, 0, 0, t.len);
    tg.addColorStop(0, "rgba(220,250,255,0.8)");
    tg.addColorStop(0.5, "rgba(53,224,255,0.45)");
    tg.addColorStop(1, "rgba(180,79,216,0)");
    ctx.strokeStyle = tg;
    ctx.lineWidth = t.width;
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(53,224,255,0.7)";
    ctx.shadowBlur = 9;
    ctx.stroke();
    ctx.shadowBlur = 0;
  });
  // bell
  var bg = ctx.createRadialGradient(0, -10, 5, 0, 0, bellR * 1.5);
  bg.addColorStop(0, "rgba(255,255,255,0.95)");
  bg.addColorStop(0.4, "rgba(200,245,255,0.7)");
  bg.addColorStop(0.75, "rgba(53,224,255,0.3)");
  bg.addColorStop(1, "rgba(53,224,255,0)");
  ctx.beginPath();
  ctx.ellipse(0, 0, bellR, bellH, 0, Math.PI, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.shadowColor = "rgba(53,224,255,0.9)";
  ctx.shadowBlur = 26;
  ctx.fill();
  ctx.shadowBlur = 0;
  // core
  ctx.beginPath();
  ctx.arc(0, -5, 9 + pulse * 2, 0, 7);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.shadowColor = "#fff"; ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

/* hex + alpha helper */
function hexA(hex, a) {
  var r = parseInt(hex.slice(1, 3), 16),
      g = parseInt(hex.slice(3, 5), 16),
      b = parseInt(hex.slice(5, 7), 16);
  return "rgba(" + r + "," + g + "," + b + "," + Math.max(0, Math.min(1, a)).toFixed(3) + ")";
}

/* ---------- Boot ---------- */
sizeCanvas();
layoutNodes();
initJelly();
window.addEventListener("resize", function () { sizeCanvas(); });
connect();
setInterval(pollState, 7000);
pollState();
updateStats();
addFeed("swarm online · awaiting telemetry", "");
requestAnimationFrame(draw);

})();
