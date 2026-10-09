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
    if (e.key === "Escape") closeSessionPanel();
  });
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
    (function (el) { setTimeout(function () { el.remove(); drawInterCardLinks(); }, 420); })(old);
  }
  // honest network: this tool + temporal predecessor (NOT causal)
  var info = { tool: tool, node: node, ts: ts };
  var prevInfo = toolSequence.length ? toolSequence[toolSequence.length - 1] : null;
  // don't link a card to itself (same tool+ts arriving twice)
  if (prevInfo && prevInfo.tool === tool && prevInfo.ts === ts) prevInfo = null;
  var canvas = card.querySelector("canvas");
  renderToolNetwork(canvas, info, prevInfo);
  toolSequence.push({ tool: tool, node: node, ts: ts, card: card });
  if (toolSequence.length > 50) toolSequence.shift();
  return card;
}

function markDone(card, ok) {
  if (!card || !card.isConnected) return;
  var foot = card.querySelector(".card-foot");
  if (!foot || foot.dataset.final) return; // don't overwrite a final state
  foot.dataset.final = "1";
  foot.classList.add("done");
  var st = foot.querySelector(".st");
  if (ok === true) { st.textContent = "DONE"; }
  else if (ok === false) { st.textContent = "FAILED"; foot.style.color = "#f87171"; }
  else { // uncertain: no completion event received, do NOT claim DONE
    st.textContent = "UNCERTAIN";
    foot.style.color = "#ffd166";
    foot.querySelector(".cdot").style.background = "#ffd166";
    foot.querySelector(".cdot").style.animation = "none";
  }
}

/* ---------- Honest tool network (Fase 2) ----------
 * Nodes ONLY from real events. No random nodes. No crawler bot.
 * Center = this tool. Left = previous tool (temporal neighbor, NOT causal).
 * Timestamps ambiguous/missing -> no line drawn (explicit, not fabricated).
 * Pop-in once, then static. No continuous animation loop.
 */
var toolSequence = []; // [{tool, node, ts, card}] in arrival order, max 50

function renderToolNetwork(canvas, info, prevInfo) {
  var dpr = window.devicePixelRatio || 1;
  var parent = canvas.parentElement;
  function size() {
    var r = parent.getBoundingClientRect();
    canvas.width = Math.max(1, r.width * dpr);
    canvas.height = Math.max(1, r.height * dpr);
  }
  size();
  var ctx = canvas.getContext("2d");
  var W = canvas.width / dpr, H = canvas.height / dpr;
  var cx = W / 2, cy = H / 2;

  // Determine if temporal link is valid
  var hasPrev = false, ambiguous = false;
  if (prevInfo) {
    if (!info.ts || !prevInfo.ts) {
      ambiguous = true; // missing timestamp -> no line
    } else if (prevInfo.ts > info.ts) {
      ambiguous = true; // out of order -> no line
    } else if (prevInfo.ts === info.ts) {
      ambiguous = true; // same timestamp -> order unknown
    } else {
      hasPrev = true;
    }
  }

  var nodes = [];
  // center: this tool
  nodes.push({ x: cx, y: cy, r: 9, color: NODE_COLORS[info.node] || "#888",
               label: info.tool, born: 0 });
  // left: previous tool (temporal neighbor only)
  var prevNode = null;
  if (prevInfo && (hasPrev || ambiguous)) {
    prevNode = { x: cx - Math.min(W * 0.28, 110), y: cy,
                 r: 6, color: NODE_COLORS[prevInfo.node] || "#888",
                 label: prevInfo.tool, born: 150 };
    nodes.push(prevNode);
  }

  var start = performance.now();
  var reduced = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function draw(now) {
    if (!canvas.isConnected) return;
    var t = reduced ? 1 : Math.min(1, (now - start) / 500);
    var ease = 1 - Math.pow(1 - t, 3);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // temporal link: solid only when order is certain
    if (prevNode && hasPrev) {
      ctx.beginPath();
      ctx.moveTo(prevNode.x, prevNode.y);
      ctx.lineTo(cx, cy);
      ctx.strokeStyle = "rgba(140,160,200,0.4)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (prevNode && ambiguous) {
      // dashed = order uncertain, drawn explicitly as uncertain
      ctx.beginPath();
      ctx.moveTo(prevNode.x, prevNode.y);
      ctx.lineTo(cx, cy);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(140,160,200,0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    nodes.forEach(function (n) {
      var lt = Math.max(0, Math.min(1, (t * 500 - n.born) / 350));
      var s = lt >= 1 ? 1 : 1 - Math.pow(1 - lt, 3);
      if (s <= 0) return;
      ctx.beginPath();
      ctx.arc(n.x, n.y, Math.max(0.1, n.r * s), 0, 7);
      ctx.fillStyle = n.color;
      ctx.shadowColor = n.color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      // label under node
      if (s > 0.7) {
        ctx.font = "9px " + 'monospace';
        ctx.fillStyle = "rgba(180,190,210,0.75)";
        ctx.textAlign = "center";
        var lbl = n.label.length > 14 ? n.label.slice(0, 13) + "…" : n.label;
        ctx.fillText(lbl, n.x, n.y + n.r + 13);
      }
    });
    if (t < 1) requestAnimationFrame(draw);
    // else: static. No loop. Honest stillness.
  }
  requestAnimationFrame(draw);
}

/* ---------- Fase 3: Inter-card links + highlight ----------
 * Lines connect cards in TEMPORAL order (from toolSequence timestamps).
 * This is temporal adjacency, NOT causal dependency — never claimed otherwise.
 * Only drawn when both cards exist in DOM and order is certain.
 */
var linkOverlay = document.getElementById("linkOverlay");
var linkCtx = (linkOverlay && linkOverlay.getContext) ? linkOverlay.getContext("2d") : null;

function drawInterCardLinks() {
  if (!linkCtx || !linkOverlay) return;
  var dpr = window.devicePixelRatio || 1;
  linkOverlay.width = window.innerWidth * dpr;
  linkOverlay.height = window.innerHeight * dpr;
  linkCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  linkCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  // Build ordered list of live cards from toolSequence
  var live = [];
  for (var i = 0; i < toolSequence.length; i++) {
    var s = toolSequence[i];
    if (s.card && s.card.isConnected && cards.indexOf(s.card) !== -1) {
      live.push(s);
    }
  }
  // Draw lines between consecutive cards (temporal order)
  for (var j = 0; j + 1 < live.length; j++) {
    var a = live[j], b = live[j + 1];
    // skip if timestamps ambiguous
    if (!a.ts || !b.ts || a.ts > b.ts || a.ts === b.ts) continue;
    var ra = a.card.getBoundingClientRect();
    var rb = b.card.getBoundingClientRect();
    var ax = ra.left + ra.width / 2, ay = ra.top + ra.height / 2;
    var bx = rb.left + rb.width / 2, by = rb.top + rb.height / 2;
    linkCtx.beginPath();
    linkCtx.moveTo(ax, ay);
    linkCtx.lineTo(bx, by);
    linkCtx.strokeStyle = "rgba(53,224,255,0.14)";
    linkCtx.lineWidth = 1;
    linkCtx.stroke();
  }
}

// Redraw links when layout changes
window.addEventListener("resize", function () { drawInterCardLinks(); });

/* Highlight: tool name glows while its tool is ACTIVE (real event only) */
function setHighlight(card, on) {
  if (!card) return;
  var el = card.querySelector(".card-head .tool");
  if (el) {
    if (on) el.classList.add("lit");
    else el.classList.remove("lit");
  }
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
    spiderPulse(); // real event -> spider reacts
    stats.tools++;
    stats.nodes[node] = 1;
    updateStats();
    var card = makeCard(tool, node, ts);
    setHighlight(card, true); // active tool glows (real event only)
    drawInterCardLinks(); // temporal links, data-driven
    pendingCards[tool + ts] = card;
    // If no completion arrives: mark UNCERTAIN, never assume DONE.
    // A timeout is not evidence of completion.
    setTimeout(function () {
      var c = pendingCards[tool + ts];
      if (c && c.isConnected) { markDone(c, null); setHighlight(c, false); }
      delete pendingCards[tool + ts];
    }, 8000);
  } else if (et === "TOOL_COMPLETED" || et === "TOOL_FAILED") {
    var ok = msg.success !== false;
    // mark most recent pending card for this tool
    for (var k in pendingCards) {
      if (k.indexOf(tool) === 0) {
        var c = pendingCards[k];
        if (c && c.isConnected) { markDone(c, ok); setHighlight(c, false); }
        delete pendingCards[k];
        break;
      }
    }
    if (!ok && tool !== "db") {
      stats.tools++;
      stats.failed++;
      stats.nodes["ERROR"] = 1;
      updateStats();
      var ec = makeCard(tool + " ✗", "ERROR", ts);
      drawInterCardLinks();
    }
  } else if (et === "TASK_STARTED" || et === "TASK_COMPLETED") {
    var tn = et === "TASK_STARTED" ? "TASK" : "COMPLETE";
    brainJudge(tool);
    stats.tools++;
    stats.nodes[tn] = 1;
    updateStats();
    makeCard(tool, tn, ts);
    drawInterCardLinks();
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
