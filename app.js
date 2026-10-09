/* CRAWLER — direct copy of reference video.
 * Cards = tool executions. Each card grows a network graph like the video.
 * Stats bar on top, JEV evaluation at bottom.
 * Data protocol preserved.
 */
(function () {
"use strict";

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
var NET_COLORS = ["#ff4fd8", "#35e0ff", "#ffd166", "#4ade80", "#a78bfa", "#ff9f43"];

/* ---------- Stats ---------- */
var stats = { tools: 0, events: 0, nodes: {}, kept: 0, skipped: 0 };
function updateStats() {
  setN("stTools", stats.tools);
  setN("stNodes", Object.keys(stats.nodes).length);
  setN("stEvents", stats.events);
  setN("stKept", stats.kept);
  setN("stSkipped", stats.skipped);
  setN("jevKept", stats.kept);
  setN("jevSkipped", stats.skipped);
}
function setN(id, v) { document.getElementById(id).textContent = v; }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

/* ---------- Cards ---------- */
var grid = document.getElementById("cardGrid");
var MAX_CARDS = 6;
var cards = [];

function makeCard(tool, node, ts) {
  var color = NODE_COLORS[node] || "#888";
  var card = document.createElement("div");
  card.className = "page-card";
  var time = new Date(ts).toTimeString().slice(0, 8);
  card.innerHTML =
    '<div class="card-head">' +
      '<span class="tool">' + esc(tool) + '</span>' +
      '<span class="node" style="color:' + color + '">' + esc(node) + '</span>' +
      '<span class="time">' + time + '</span>' +
    '</div>' +
    '<div class="card-net"><canvas></canvas></div>' +
    '<div class="card-foot"><span class="cdot"></span><span class="st">CRAWLING</span></div>';
  grid.insertBefore(card, grid.firstChild);
  cards.unshift(card);
  // remove oldest
  while (cards.length > MAX_CARDS) {
    var old = cards.pop();
    old.classList.add("out");
    (function (el) { setTimeout(function () { el.remove(); }, 420); })(old);
  }
  // start network growth
  var canvas = card.querySelector("canvas");
  growNetwork(canvas, color);
  return card;
}

function markDone(card, ok) {
  var foot = card.querySelector(".card-foot");
  foot.classList.add("done");
  foot.querySelector(".st").textContent = ok === false ? "FAILED" : "DONE";
  if (ok === false) foot.style.color = "#f87171";
}

/* ---------- Mini network graph (like video) ---------- */
function growNetwork(canvas, baseColor) {
  var dpr = window.devicePixelRatio || 1;
  function size() {
    var r = canvas.parentElement.getBoundingClientRect();
    canvas.width = r.width * dpr;
    canvas.height = r.height * dpr;
  }
  size();
  var ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  var W = canvas.width / dpr, H = canvas.height / dpr;
  var cx = W / 2, cy = H / 2;

  var nodes = [{ x: cx, y: cy, r: 7, color: baseColor, born: 0 }];
  var links = [];
  var crawler = { x: cx, y: cy, tx: cx, ty: cy, speed: 2.2 };
  var targetCount = 8 + Math.floor(Math.random() * 5);
  var spawnTimer = 0;
  var dead = false;

  function spawnNode() {
    var ang = Math.random() * Math.PI * 2;
    var dist = 30 + Math.random() * Math.min(W, H) * 0.36;
    var x = cx + Math.cos(ang) * dist;
    var y = cy + Math.sin(ang) * dist;
    x = Math.max(14, Math.min(W - 14, x));
    y = Math.max(14, Math.min(H - 14, y));
    // link to random existing node
    var parent = nodes[Math.floor(Math.random() * nodes.length)];
    var color = NET_COLORS[Math.floor(Math.random() * NET_COLORS.length)];
    var n = { x: x, y: y, r: 3 + Math.random() * 4, color: color, born: performance.now() };
    nodes.push(n);
    links.push({ a: parent, b: n });
    // crawler heads to new node
    crawler.tx = x; crawler.ty = y;
  }

  function frame() {
    if (dead) return;
    if (!canvas.isConnected) { dead = true; return; }
    ctx.clearRect(0, 0, W, H);
    var now = performance.now();

    // spawn over ~2s
    spawnTimer += 1 / 60;
    if (nodes.length < targetCount && spawnTimer > 0.22) {
      spawnTimer = 0;
      spawnNode();
    }

    // links
    links.forEach(function (lk) {
      ctx.beginPath();
      ctx.moveTo(lk.a.x, lk.a.y);
      ctx.lineTo(lk.b.x, lk.b.y);
      ctx.strokeStyle = "rgba(140,160,200,0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // nodes (pop-in)
    nodes.forEach(function (n) {
      var age = (now - n.born) / 400;
      var s = age >= 1 ? 1 : 1 - Math.pow(1 - age, 3);
      if (s <= 0) return;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * s, 0, 7);
      ctx.fillStyle = n.color;
      ctx.shadowColor = n.color;
      ctx.shadowBlur = 9;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // crawler bot
    var dx = crawler.tx - crawler.x, dy = crawler.ty - crawler.y;
    var d = Math.hypot(dx, dy);
    if (d > 2) {
      crawler.x += dx / d * Math.min(crawler.speed, d);
      crawler.y += dy / d * Math.min(crawler.speed, d);
    } else if (nodes.length > 1) {
      var t = nodes[Math.floor(Math.random() * nodes.length)];
      crawler.tx = t.x; crawler.ty = t.y;
    }
    ctx.beginPath();
    ctx.arc(crawler.x, crawler.y, 4, 0, 7);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------- Brain (JEV) ---------- */
function brainJudge(tool) {
  var isSystem = tool === "db" || tool === "muse.db";
  if (isSystem) stats.skipped++; else stats.kept++;
  updateStats();
  return !isSystem;
}

/* ---------- Events ---------- */
var seenEvents = {};
var pendingCards = {}; // tool -> card (for DONE marking)
var lastEventTs = 0;
var STALE_MS = 60000;

function handleMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  var eid = msg.event_id;
  if (eid) {
    if (seenEvents[eid]) return;
    seenEvents[eid] = 1;
    var ks = Object.keys(seenEvents);
    if (ks.length > 500) delete seenEvents[ks[0]];
  }
  stats.events++;
  var et = msg.event_type, tool = msg.tool || "task";
  var ts = msg.timestamp || Date.now();
  var node = (msg.node && msg.node !== "UNKNOWN") ? msg.node : toolToNode(tool);

  if (et === "TOOL_STARTED") {
    if (!brainJudge(tool)) return; // SKIPPED
    lastEventTs = Date.now();
    stats.tools++;
    stats.nodes[node] = 1;
    updateStats();
    var card = makeCard(tool, node, ts);
    pendingCards[tool + ts] = card;
    // auto-mark done after 4s if no completion arrives
    setTimeout(function () {
      var c = pendingCards[tool + ts];
      if (c && c.isConnected) markDone(c, true);
    }, 4000);
  } else if (et === "TOOL_COMPLETED" || et === "TOOL_FAILED") {
    var ok = msg.success !== false;
    // mark most recent pending card for this tool
    for (var k in pendingCards) {
      if (k.indexOf(tool) === 0) {
        var c = pendingCards[k];
        if (c && c.isConnected) markDone(c, ok);
        delete pendingCards[k];
        break;
      }
    }
    if (!ok && tool !== "db") {
      stats.tools++;
      stats.nodes["ERROR"] = 1;
      updateStats();
      makeCard(tool + " ✗", "ERROR", ts);
    }
  } else if (et === "TASK_STARTED" || et === "TASK_COMPLETED") {
    var tn = et === "TASK_STARTED" ? "TASK" : "COMPLETE";
    brainJudge(tool);
    stats.tools++;
    stats.nodes[tn] = 1;
    updateStats();
    makeCard(tool, tn, ts);
  }
  updateStats();
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
  setConn(wsFail > 2 ? "dead" : "", wsFail > 2 ? "FALLBACK" : "...");
  setTimeout(connect, Math.min(5000 * wsFail, 30000));
}
function pollState() {
  fetch(STATE_URL, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (st) {
      if (!st || wsLive) return;
      var ts = st.timestamp || st.updated_at || 0;
      if (ts <= lastStateTs) return;
      lastStateTs = ts;
      var tool = st.latest_tool || st.tool || "";
      if (tool && brainJudge(tool)) {
        var node = toolToNode(tool);
        stats.tools++; stats.nodes[node] = 1; updateStats();
        makeCard(tool, node, ts);
      }
    }).catch(function () {});
}

/* ---------- Staleness: transport open != agent active ---------- */
setInterval(function () {
  if (!wsLive) return;
  var idle = Date.now() - lastEventTs;
  if (lastEventTs > 0 && idle > STALE_MS) {
    setConn("", "STALE \u00b7 no activity " + Math.round(idle / 1000) + "s");
  } else if (wsLive) {
    setConn("live", "LIVE");
  }
}, 5000);

/* ---------- Boot ---------- */
connect();
setInterval(pollState, 7000);
pollState();
updateStats();

})();
