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
/* (NET_COLORS removed Fase 2: no random decorative nodes) */

/* ---------- Fase 4: Counter tween (honest animation) ----------
 * Animates number transitions but ALWAYS lands on the exact real value.
 * Rapid updates: retargets mid-tween from current displayed value.
 * No update is ever lost; final value always equals actual data.
 */
var tweens = {};
var tweenRunning = false;
function tweenNumber(id, to) {
  var el = document.getElementById(id);
  if (!el) return;
  to = Math.max(0, Math.round(to));
  var current = parseInt(el.textContent, 10);
  if (isNaN(current)) current = 0;
  // If tween in progress, retarget from currently displayed value
  if (tweens[id]) current = parseInt(el.textContent, 10) || 0;
  if (current === to) { delete tweens[id]; return; }
  var reduced = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) { el.textContent = to; delete tweens[id]; return; }
  tweens[id] = { from: current, to: to, start: performance.now() };
  if (!tweenRunning) { tweenRunning = true; requestAnimationFrame(tweenFrame); }
}
function tweenFrame(now) {
  var active = false;
  for (var id in tweens) {
    var t = tweens[id];
    var el = document.getElementById(id);
    if (!el) { delete tweens[id]; continue; }
    var p = Math.min(1, (now - t.start) / 450);
    var eased = 1 - Math.pow(1 - p, 3);
    var v = Math.round(t.from + (t.to - t.from) * eased);
    if (p >= 1) { v = t.to; delete tweens[id]; } // exact landing
    else active = true;
    el.textContent = v;
  }
  if (active) requestAnimationFrame(tweenFrame);
  else tweenRunning = false;
}

/* ---------- Fase 5: Session results panel ----------
 * HONEST statuses only:
 *   ACTIVE       - receiving events (wsLive, not stale)
 *   INACTIVE     - STALE: no valid events for 60s+ (NOT "complete")
 *   DISCONNECTED - transport down
 *   UNKNOWN      - initial / cannot determine
 * We NEVER claim COMPLETE without a valid session-end signal.
 * Our event contract has no session-end event, so COMPLETE is not offered.
 */
var stats = { tools: 0, events: 0, nodes: {}, kept: 0, skipped: 0, failed: 0 };
var sessionPanel = document.getElementById("sessionPanel");

function getSessionStatus() {
  if (wsLive) {
    var idle = Date.now() - lastEventTs;
    if (lastEventTs > 0 && idle > STALE_MS) return { k: "INACTIVE", d: "No valid events for " + Math.round(idle / 1000) + "s. Session may still resume." };
    if (lastEventTs > 0) return { k: "ACTIVE", d: "Receiving live events." };
    return { k: "UNKNOWN", d: "Connected, no events observed yet." };
  }
  if (wsFail > 0) return { k: "DISCONNECTED", d: "Transport down. Showing last known data (may be stale)." };
  return { k: "UNKNOWN", d: "Connection not established." };
}

function openSessionPanel() {
  if (!sessionPanel) return;
  var st = getSessionStatus();
  document.getElementById("sessionStatus").textContent = st.k;
  document.getElementById("sessionStatus").style.color =
    st.k === "ACTIVE" ? "#4ade80" : st.k === "INACTIVE" ? "#ffd166" :
    st.k === "DISCONNECTED" ? "#f87171" : "#8a93a6";
  // All counts from real stats (deduped at ingestion; no double-count)
  document.getElementById("sessionStats").innerHTML =
    "Tools observed: <b>" + stats.tools + "</b><br>" +
    "Events processed: <b>" + stats.events + "</b><br>" +
    "Kept: <b>" + stats.kept + "</b> · Skipped: <b>" + stats.skipped + "</b><br>" +
    "Failed: <b>" + stats.failed + "</b><br>" +
    "<span style='color:#5a6376'>" + esc(st.d) + "</span>";
  sessionPanel.hidden = false;
}
function closeSessionPanel() { if (sessionPanel) sessionPanel.hidden = true; }

// Wire up: click brand area to open, × to close, Esc to close
(function () {
  var brand = document.getElementById("brand");
  if (brand) { brand.style.cursor = "pointer"; brand.title = "Session summary"; }
  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "sessionClose") { closeSessionPanel(); return; }
    var b = e.target && e.target.closest ? e.target.closest("#brand") : null;
    if (b && sessionPanel) {
      if (sessionPanel.hidden) openSessionPanel(); else closeSessionPanel();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeSessionPanel(); hideDetail(); }
  });
  var dc = document.getElementById("detailClose");
  if (dc) dc.addEventListener("click", hideDetail);
})();
function updateStats() {
  tweenNumber("stTools", stats.tools);
  tweenNumber("stNodes", Object.keys(stats.nodes).length);
  tweenNumber("stEvents", stats.events);
  tweenNumber("stKept", stats.kept);
  tweenNumber("stSkipped", stats.skipped);
  tweenNumber("jevKept", stats.kept);
  tweenNumber("jevSkipped", stats.skipped);
}
/* setN removed Fase 4: replaced by tweenNumber (exact-landing animation) */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

/* ---------- Spider status indicator (header identity) ---------- */
var spiderMark = document.getElementById("spiderMark");
var agentStatus = document.getElementById("agentStatus");
var spiderIdleTimer = null;
function spiderPulse() {
  // Tied to REAL events only — no ambient fake activity
  if (!spiderMark) return;
  spiderMark.classList.add("active");
  if (agentStatus) {
    agentStatus.textContent = "WORKING";
    agentStatus.className = "working";
  }
  if (spiderIdleTimer) clearTimeout(spiderIdleTimer);
  spiderIdleTimer = setTimeout(function () {
    spiderMark.classList.remove("active");
    if (agentStatus) {
      agentStatus.textContent = "IDLE";
      agentStatus.className = "idle";
    }
  }, 8000);
}

/* ================= SESSION NETWORK (Network-Centric) =================
 * Satu jaringan persistent untuk seluruh sesi. Setiap TOOL_STARTED = 1 node.
 * Edge = urutan temporal (BUKAN kausal). Tidak ada node palsu.
 * Force-directed layout yang settle ke statis saat tidak ada event.
 */
var netCanvas = document.getElementById("networkCanvas");
var netCtx = (netCanvas && netCanvas.getContext) ? netCanvas.getContext("2d") : null;
var netNodes = [];   // {id, tool, cat, ts, x, y, vx, vy, status, born}
var netEdges = [];   // {a, b} — temporal sequence
var netSeq = [];     // node ids in arrival order
var netMaxNodes = 120;
var netRunning = false;
var netSelected = null;

function netResize() {
  if (!netCanvas) return;
  var dpr = window.devicePixelRatio || 1;
  var r = netCanvas.parentElement.getBoundingClientRect();
  netCanvas.width = Math.max(1, r.width * dpr);
  netCanvas.height = Math.max(1, r.height * dpr);
}
window.addEventListener("resize", netResize);

function netAddNode(tool, cat, ts, eventId) {
  if (!netCtx) return null;
  // Dedup: same eventId already has a node
  for (var i = 0; i < netNodes.length; i++) {
    if (netNodes[i].eid === eventId) return netNodes[i];
  }
  netResize();
  var dpr = window.devicePixelRatio || 1;
  var W = netCanvas.width / dpr, H = netCanvas.height / dpr;
  // Start near previous node (or center if first)
  var px = W / 2, py = H / 2;
  if (netSeq.length) {
    var prev = netNodes[netSeq[netSeq.length - 1]];
    if (prev) { px = prev.x + 40; py = prev.y; } // offset right, deterministic
    px = Math.max(60, Math.min(W - 60, px));
    py = Math.max(60, Math.min(H - 60, py));
  }
  var node = {
    id: netNodes.length, eid: eventId, tool: tool, cat: cat, ts: ts,
    x: px, y: py, vx: 0, vy: 0,
    status: "active", born: performance.now()
  };
  netNodes.push(node);
  // Edge to previous (temporal, not causal)
  if (netSeq.length) {
    var prevId = netSeq[netSeq.length - 1];
    var prevNode = netNodes[prevId];
    if (prevNode && prevNode.ts && ts && prevNode.ts <= ts) {
      netEdges.push({ a: prevId, b: node.id });
    }
  }
  netSeq.push(node.id);
  // Cap: fade oldest to faint but keep (never delete history abruptly)
  if (netNodes.length > netMaxNodes) {
    var drop = netNodes.length - netMaxNodes;
    for (var d = 0; d < drop; d++) netNodes[d].faded = true;
  }
  hideEmptyHint();
  netKick();
  return node;
}

function netSetStatus(eventId, status) {
  for (var i = 0; i < netNodes.length; i++) {
    if (netNodes[i].eid === eventId) {
      netNodes[i].status = status;
      if (netSelected && netSelected.eid === eventId) showDetail(netNodes[i]);
      break;
    }
  }
}

function hideEmptyHint() {
  var h = document.getElementById("emptyHint");
  if (h) h.style.display = "none";
}

/* Force-directed layout: repulsion + springs, settles to static */
function netPhysics() {
  var dpr = window.devicePixelRatio || 1;
  var W = netCanvas.width / dpr, H = netCanvas.height / dpr;
  var cx = W / 2, cy = H / 2;
  var energy = 0;
  // repulsion (O(n^2) but n<=120, fine)
  for (var i = 0; i < netNodes.length; i++) {
    var a = netNodes[i];
    if (a.faded) continue;
    for (var j = i + 1; j < netNodes.length; j++) {
      var b = netNodes[j];
      if (b.faded) continue;
      var dx = a.x - b.x, dy = a.y - b.y;
      var d2 = dx * dx + dy * dy + 0.1;
      var d = Math.sqrt(d2);
      var f = Math.min(800 / d2, 2);
      var fx = dx / d * f, fy = dy / d * f;
      a.vx += fx * 0.5; a.vy += fy * 0.5;
      b.vx -= fx * 0.5; b.vy -= fy * 0.5;
    }
  }
  // springs along edges
  netEdges.forEach(function (e) {
    var a = netNodes[e.a], b = netNodes[e.b];
    if (!a || !b || a.faded || b.faded) return;
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var target = 90;
    var f = (d - target) * 0.02;
    var fx = dx / d * f, fy = dy / d * f;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  });
  // gentle centering
  netNodes.forEach(function (n) {
    if (n.faded) return;
    n.vx += (cx - n.x) * 0.002;
    n.vy += (cy - n.y) * 0.002;
    n.vx *= 0.88; n.vy *= 0.88; // damping
    n.x += n.vx; n.y += n.vy;
    // bounds
    n.x = Math.max(30, Math.min(W - 30, n.x));
    n.y = Math.max(30, Math.min(H - 30, n.y));
    energy += Math.abs(n.vx) + Math.abs(n.vy);
  });
  return energy;
}

function netDraw(now) {
  if (!netCtx) { netRunning = false; return; }
  var dpr = window.devicePixelRatio || 1;
  var W = netCanvas.width / dpr, H = netCanvas.height / dpr;
  netCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  netCtx.clearRect(0, 0, W, H);
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // edges
  netEdges.forEach(function (e) {
    var a = netNodes[e.a], b = netNodes[e.b];
    if (!a || !b) return;
    var alpha = (a.faded || b.faded) ? 0.06 : 0.28;
    netCtx.beginPath();
    netCtx.moveTo(a.x, a.y);
    netCtx.lineTo(b.x, b.y);
    netCtx.strokeStyle = "rgba(140,160,200," + alpha + ")";
    netCtx.lineWidth = 1;
    netCtx.stroke();
  });

  // nodes
  netNodes.forEach(function (n) {
    var age = reduced ? 1 : Math.min(1, (now - n.born) / 450);
    var s = age >= 1 ? 1 : 1 - Math.pow(1 - age, 3);
    if (s <= 0) return;
    var color = NODE_COLORS[n.cat] || "#888";
    var r = (n.faded ? 3 : 6 + (n.status === "active" ? 2 : 0)) * s;
    var alpha = n.faded ? 0.25 : 1;
    // glow for active/recent
    if (!n.faded && n.status === "active") {
      netCtx.beginPath();
      netCtx.arc(n.x, n.y, r + 6, 0, 7);
      netCtx.fillStyle = color + "22";
      netCtx.fill();
    }
    netCtx.beginPath();
    netCtx.arc(n.x, n.y, Math.max(0.5, r), 0, 7);
    netCtx.globalAlpha = alpha;
    netCtx.fillStyle = color;
    netCtx.shadowColor = color;
    netCtx.shadowBlur = n.faded ? 0 : 8;
    netCtx.fill();
    netCtx.shadowBlur = 0;
    // status ring
    if (!n.faded && n.status !== "active") {
      netCtx.beginPath();
      netCtx.arc(n.x, n.y, r + 3, 0, 7);
      netCtx.strokeStyle = n.status === "done" ? "#4ade80" :
                           n.status === "failed" ? "#f87171" : "#ffd166";
      netCtx.lineWidth = 1.5;
      netCtx.stroke();
    }
    // selection ring
    if (netSelected === n) {
      netCtx.beginPath();
      netCtx.arc(n.x, n.y, r + 7, 0, 7);
      netCtx.strokeStyle = "#fff";
      netCtx.lineWidth = 1;
      netCtx.stroke();
    }
    // label for recent nodes only (avoid clutter)
    if (!n.faded && s > 0.8 && netNodes.length < 40) {
      netCtx.font = "10px monospace";
      netCtx.fillStyle = "rgba(180,190,210,0.8)";
      netCtx.textAlign = "center";
      var lbl = n.tool.length > 12 ? n.tool.slice(0, 11) + "…" : n.tool;
      netCtx.fillText(lbl, n.x, n.y + r + 14);
    }
    netCtx.globalAlpha = 1;
  });

  // physics: run until settled, then stop (honest stillness)
  // BUT keep running while crawlers are active (they are real activity)
  updateCrawlers(now);
  drawCrawlers();
  if (!reduced) {
    var energy = netPhysics();
    if (energy > 0.5 || crawlers.length > 0) {
      requestAnimationFrame(netDraw);
    } else {
      netRunning = false;
    }
  } else {
    if (crawlers.length > 0) requestAnimationFrame(netDraw);
    else netRunning = false;
  }
}

/* ================= CRAWLER ARMY =================
 * Crawlers = visual representation of tool executions.
 * - Spawn from Master Spider on TOOL_STARTED (real event only)
 * - browser.* tools: exploration behavior (spread outward, web activity)
 * - other tools: move directly to their network node
 * - Return to spider on COMPLETE/FAILED, then fade
 * HONEST: crawlers represent tool executions, NOT specific URLs.
 * We do not have URL data and do not fabricate it.
 */
var crawlers = []; // {x,y,tx,ty,state,nodeId,isWeb,born,alpha}
var masterSpiderEl = document.getElementById("masterSpider");

function spiderPos() {
  if (!masterSpiderEl) return { x: 80, y: window.innerHeight / 2 };
  var r = masterSpiderEl.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function isWebTool(tool) {
  var t = String(tool).toLowerCase();
  return t.indexOf("browser") !== -1 || t === "search" || t === "deep_research" || t === "open";
}

function spawnCrawlers(tool, node) {
  if (!netCtx) return;
  var sp = spiderPos();
  var web = isWebTool(tool);
  var count = web ? 3 : 1;
  // deterministic spread: fan out by index (no randomness)
  for (var i = 0; i < count; i++) {
    var angle = web ? (-0.5 + i * 0.5) : 0; // web: fan; else: straight
    crawlers.push({
      x: sp.x, y: sp.y,
      tx: sp.x, ty: sp.y,
      angle: angle, isWeb: web,
      nodeId: node ? node.id : null,
      state: "deploying", // deploying -> exploring/working -> returning -> gone
      born: performance.now(), alpha: 0
    });
  }
  if (masterSpiderEl) masterSpiderEl.classList.add("working");
  netKick();
}

function crawlerTarget(c) {
  var dpr = window.devicePixelRatio || 1;
  var W = netCanvas.width / dpr, H = netCanvas.height / dpr;
  if (c.state === "returning") {
    var sp = spiderPos();
    return { x: sp.x, y: sp.y };
  }
  if (c.isWeb && c.state === "exploring") {
    // Web exploration: move outward in fan pattern (deterministic drift)
    // Target is a region, NOT a specific URL (we don't have URL data)
    var t = (performance.now() - c.born) / 1000;
    var baseX = W * 0.55, baseY = H * 0.5;
    return {
      x: baseX + Math.cos(c.angle * 2 + t * 0.3) * W * 0.28,
      y: baseY + Math.sin(c.angle * 2 + t * 0.4) * H * 0.3
    };
  }
  // Non-web or deploying: go to assigned node
  if (c.nodeId != null && netNodes[c.nodeId]) {
    return { x: netNodes[c.nodeId].x, y: netNodes[c.nodeId].y };
  }
  return { x: c.x, y: c.y };
}

function updateCrawlers(now) {
  var sp = spiderPos();
  for (var i = crawlers.length - 1; i >= 0; i--) {
    var c = crawlers[i];
    // fade in
    if (c.alpha < 1 && c.state !== "returning") c.alpha = Math.min(1, c.alpha + 0.06);
    // state transitions
    if (c.state === "deploying") {
      var d0 = Math.hypot(c.tx - c.x, c.ty - c.y);
      if (d0 < 8) c.state = c.isWeb ? "exploring" : "working";
    }
    if (c.state === "returning") {
      c.alpha -= 0.05;
      if (c.alpha <= 0 || Math.hypot(sp.x - c.x, sp.y - c.y) < 12) {
        crawlers.splice(i, 1);
        continue;
      }
    }
    var tgt = crawlerTarget(c);
    c.tx = tgt.x; c.ty = tgt.y;
    var dx = c.tx - c.x, dy = c.ty - c.y;
    var d = Math.hypot(dx, dy);
    var speed = c.isWeb ? 2.5 : 4;
    if (d > 1) {
      c.x += dx / d * Math.min(speed, d);
      c.y += dy / d * Math.min(speed, d);
    }
  }
  // spider idle when no crawlers
  if (!crawlers.length && masterSpiderEl) masterSpiderEl.classList.remove("working");
}

function recallCrawlers(nodeId) {
  crawlers.forEach(function (c) {
    if (c.nodeId === nodeId && c.state !== "returning") c.state = "returning";
  });
  netKick();
}

function drawCrawlers() {
  if (!netCtx) return;
  crawlers.forEach(function (c) {
    if (c.alpha <= 0) return;
    netCtx.globalAlpha = Math.max(0, c.alpha);
    // crawler body: small diamond
    var s = c.isWeb ? 4 : 3;
    netCtx.beginPath();
    netCtx.moveTo(c.x, c.y - s);
    netCtx.lineTo(c.x + s, c.y);
    netCtx.lineTo(c.x, c.y + s);
    netCtx.lineTo(c.x - s, c.y);
    netCtx.closePath();
    netCtx.fillStyle = c.isWeb ? "#35e0ff" : "#a78bfa";
    netCtx.shadowColor = c.isWeb ? "#35e0ff" : "#a78bfa";
    netCtx.shadowBlur = 8;
    netCtx.fill();
    netCtx.shadowBlur = 0;
    // trail
    netCtx.beginPath();
    netCtx.moveTo(c.x, c.y);
    netCtx.lineTo(c.x - (c.tx - c.x) * 0.08, c.y - (c.ty - c.y) * 0.08);
    netCtx.strokeStyle = c.isWeb ? "rgba(53,224,255,0.35)" : "rgba(167,139,250,0.35)";
    netCtx.lineWidth = 1;
    netCtx.stroke();
    netCtx.globalAlpha = 1;
  });
}

function netKick() {
  if (!netRunning && netCtx) {
    netRunning = true;
    requestAnimationFrame(netDraw);
  } else if (netCtx) {
    // already running; ensure one fresh frame for pop-in
    requestAnimationFrame(netDraw);
  }
}

/* Click node -> detail panel (secondary, not dominating) */
if (netCanvas) {
  netCanvas.addEventListener("click", function (ev) {
    var r = netCanvas.getBoundingClientRect();
    var mx = ev.clientX - r.left, my = ev.clientY - r.top;
    var best = null, bestD = 24;
    netNodes.forEach(function (n) {
      if (n.faded) return;
      var d = Math.hypot(n.x - mx, n.y - my);
      if (d < bestD) { bestD = d; best = n; }
    });
    netSelected = best;
    if (best) showDetail(best);
    else hideDetail();
    netKick();
  });
}

function showDetail(n) {
  var p = document.getElementById("detailPanel");
  if (!p) return;
  document.getElementById("detailTool").textContent = n.tool;
  var color = NODE_COLORS[n.cat] || "#888";
  document.getElementById("detailMeta").innerHTML =
    "category <b style='color:" + color + "'>" + esc(n.cat) + "</b><br>" +
    "time <b>" + new Date(n.ts).toTimeString().slice(0, 8) + "</b><br>" +
    "event <b>" + esc(String(n.eid || "—")).slice(0, 20) + "</b>";
  var st = document.getElementById("detailStatus");
  var label = { active: "RUNNING", done: "DONE", failed: "FAILED", uncertain: "UNCERTAIN" }[n.status] || n.status;
  st.textContent = label;
  st.style.color = n.status === "done" ? "#4ade80" : n.status === "failed" ? "#f87171" :
                   n.status === "uncertain" ? "#ffd166" : "#35e0ff";
  p.hidden = false;
}
function hideDetail() {
  var p = document.getElementById("detailPanel");
  if (p) p.hidden = true;
  netSelected = null;
}


/* ---------- Brain (JEV) ---------- */
var jevItemEl = document.getElementById("jevItem");
function brainJudge(tool) {
  var isSystem = tool === "db" || tool === "muse.db";
  if (isSystem) stats.skipped++; else stats.kept++;
  // JEV active item: shows LAST evaluated tool + decision (honest: not "processing",
  // our evaluation is instant; this is a record, not a live claim)
  if (jevItemEl) {
    var short = tool.length > 18 ? tool.slice(0, 17) + "…" : tool;
    jevItemEl.textContent = short + " → " + (isSystem ? "SKIPPED" : "KEPT");
    jevItemEl.style.color = isSystem ? "#6f7683" : "#4ade80";
  }
  updateStats();
  return !isSystem;
}

/* ---------- Events -> Network ---------- */
var seenEvents = {};
var pendingNodes = {}; // eventId -> node (for status updates)
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
    spiderPulse(); // real event -> spider reacts
    stats.tools++;
    stats.nodes[node] = 1;
    updateStats();
    var n = netAddNode(tool, node, ts, eid);
    if (n && eid) pendingNodes[eid] = n;
    spawnCrawlers(tool, n); // crawlers deploy from spider (real event)
    // If no completion arrives: mark UNCERTAIN, never assume DONE.
    if (eid) {
      (function (id) {
        setTimeout(function () {
          var pn = pendingNodes[id];
          if (pn && pn.status === "active") netSetStatus(id, "uncertain");
          delete pendingNodes[id];
        }, 8000);
      })(eid);
    }
  } else if (et === "TOOL_COMPLETED" || et === "TOOL_FAILED") {
    var ok = msg.success !== false;
    // Match by eventId first, then by tool name (fallback for unpaired events)
    var matched = false;
    var matchedNodeId = null;
    if (eid && pendingNodes[eid]) {
      netSetStatus(eid, ok ? "done" : "failed");
      matchedNodeId = pendingNodes[eid].id;
      delete pendingNodes[eid];
      matched = true;
    } else {
      for (var k in pendingNodes) {
        if (pendingNodes[k].tool === tool && pendingNodes[k].status === "active") {
          netSetStatus(k, ok ? "done" : "failed");
          matchedNodeId = pendingNodes[k].id;
          delete pendingNodes[k];
          matched = true;
          break;
        }
      }
    }
    if (matchedNodeId != null) recallCrawlers(matchedNodeId);
    if (!ok && tool !== "db" && !matched) {
      // Failed without a prior START: create node directly as failed
      stats.tools++;
      stats.failed++;
      stats.nodes["ERROR"] = 1;
      updateStats();
      var en = netAddNode(tool, "ERROR", ts, eid);
      if (en) netSetStatus(eid || ("err-" + ts), "failed");
    } else if (!ok) {
      stats.failed++;
      updateStats();
    }
  } else if (et === "TASK_STARTED" || et === "TASK_COMPLETED") {
    var tn = et === "TASK_STARTED" ? "TASK" : "COMPLETE";
    brainJudge(tool);
    stats.tools++;
    stats.nodes[tn] = 1;
    updateStats();
    netAddNode(tool, tn, ts, eid);
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
        netAddNode(tool, node, ts, "poll-" + ts);
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
