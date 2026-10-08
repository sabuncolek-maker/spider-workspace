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
    svg.setAttribute("viewBox", narrow ? "90 60 1020 680" : "0 0 1200 800");
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

  /* ---------- spider legs (geometric, minimal) ---------- */
  function buildLegs() {
    var L = document.getElementById("legsL");
    var Rg = document.getElementById("legsR");
    // 4 legs per side; each: hip -> knee -> foot
    var hips = [[-6, -6], [-7, -1], [-7, 4], [-6, 9]];
    var joints = document.getElementById("joints");
    hips.forEach(function (h, i) {
      var spread = 14 + i * 7;
      var kneeL = [h[0] - spread * 0.55, h[1] - 6 - i * 2];
      var footL = [h[0] - spread, h[1] + 10 - i * 3];
      var kneeR = [-kneeL[0], kneeL[1]];
      var footR = [-footL[0], footL[1]];
      el("polyline", {
        points: h[0] + "," + h[1] + " " + kneeL[0] + "," + kneeL[1] + " " + footL[0] + "," + footL[1],
        fill: "none"
      }, L);
      el("polyline", {
        points: (-h[0]) + "," + h[1] + " " + kneeR[0] + "," + kneeR[1] + " " + footR[0] + "," + footR[1],
        fill: "none"
      }, Rg);
      el("circle", { cx: kneeL[0], cy: kneeL[1], r: 1.6 }, joints);
      el("circle", { cx: kneeR[0], cy: kneeR[1], r: 1.6 }, joints);
    });
  }
  buildLegs();

  var spider = document.getElementById("spider");
  var spiderTarget = "IDLE"; // last resolved node; spider never moves without state
  var ripplesG = document.getElementById("ripples");

  /* Arrival ripple: purely state-driven visual feedback.
   * Fires only inside moveSpider(), i.e. only when state actually changed. */
  function ripple(x, y, hot) {
    var c = el("circle", {
      cx: x, cy: y, r: 26,
      "class": "ripple" + (hot ? " hot" : "")
    }, ripplesG);
    setTimeout(function () {
      if (c.parentNode) c.parentNode.removeChild(c);
    }, 1600);
  }

  function moveSpider(node) {
    if (!POS[node]) node = "UNKNOWN";
    var changed = (node !== spiderTarget);
    spiderTarget = node;
    var p = POS[node];
    spider.setAttribute("transform", "translate(" + p.x + "," + p.y + ")");
    spider.setAttribute("opacity", "1");
    if (changed) {
      ripple(p.x, p.y, node === "ERROR");
      spider.setAttribute("class", "arrived");
      setTimeout(function () { spider.setAttribute("class", ""); }, 1200);
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
    ro("roStep", esc(ex.current_step || "UNKNOWN"));
    var toolHtml = esc(ex.current_tool || "—");
    if (isSystemTool(ex.current_tool)) toolHtml += '<span class="sys">SYSTEM</span>';
    else if (ex.tool_status) toolHtml += ' <span style="color:var(--dim)">[' + esc(ex.tool_status) + "]</span>";
    ro("roTool", toolHtml);
    ro("roLatest", esc(ex.latest_action || ex.latest_result_preview || "—"));

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
    if (target !== spiderTarget) moveSpider(target);
    else if (spider.getAttribute("opacity") === "0") moveSpider(target);
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
  var wsStatus = "CONNECTING"; // LIVE | FALLBACK | CONNECTING
  var wsRetryMs = 2000;
  var WS_RETRY_MAX = 60000;
  var reconnectTimer = null;
  var seenEventIds = new Set();
  var maxSeq = -1;

  function setConn(status) {
    wsStatus = status;
    var dot = document.getElementById("connDot");
    var txt = document.getElementById("connText");
    if (!dot || !txt) return;
    var cls = status === "LIVE" ? "on" : status === "CONNECTING" ? "mid" : "";
    dot.setAttribute("class", cls);
    txt.setAttribute("class", cls);
    txt.textContent = status;
    txt.setAttribute("title", status === "LIVE"
      ? "realtime via WebSocket"
      : status === "CONNECTING"
        ? "connecting to realtime channel…"
        : "realtime unavailable — polling state.json");
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
    // same node twice: no move out-and-back; still occupies its 1.2s slot
    // and is recorded in history/readout like every other event.
    if (item.node && POS[item.node] && item.node !== spiderTarget) {
      moveSpider(item.node);
    }
    setRo("roTool", esc(item.tool || "?") + statusTag(item.status));
    setRo("roStep", esc(label));
    setTimeout(function () {
      queueBusy = false;
      playingItem = null;
      pumpQueue();
    }, VISUAL_MIN_MS);
  }

  function handleActionEvent(msg) {
    if (!msg || msg.type !== "spider_event" || !msg.event_type || !msg.event_id) {
      return false;
    }
    if (seenActionIds.has(msg.event_id)) return false; // duplicate
    var ts = Date.parse(msg.timestamp);
    var seq = typeof msg.seq === "number" && isFinite(msg.seq) ? msg.seq : -1;
    if (isNaN(ts)) return false;
    if (ts < lastActionTs || (ts === lastActionTs && seq <= lastActionSeq)) {
      return false; // stale: never move the spider backwards
    }
    seenActionIds.add(msg.event_id);
    if (seenActionIds.size > 500) {
      seenActionIds = new Set(Array.from(seenActionIds).slice(-200));
    }
    lastActionTs = ts;
    lastActionSeq = seq;

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
      updateQueueIndicator();
      pumpQueue();
      return true;
    }
    if (et === "TOOL_COMPLETED" || et === "TOOL_FAILED") {
      var ok = msg.success !== false;
      if (tool && !isSystem) {
        markQueuedTool(tool, ok);
        addEventHistory(ts, node, tool, ok ? "DONE" : "FAILED");
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
    if (msg && msg.type === "spider_event") return handleActionEvent(msg);
    if (msg && msg.type === "spider_state") {
      // reuse the snapshot validator inline (same rules as handleWsMessage)
      return handleWsMessage(data);
    }
    return false;
  }

  function scheduleReconnect() {
    setConn("FALLBACK"); // spider keeps last position; polling continues
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
    setConn("CONNECTING");
    var socket;
    try {
      socket = new WebSocket(WS_URL);
    } catch (e) {
      scheduleReconnect();
      return;
    }
    ws = socket;
    socket.onopen = function () {
      wsRetryMs = 2000; // reset backoff on success
      setConn("LIVE");
    };
    socket.onmessage = function (ev) {
      dispatchRealtimeMessage(ev.data);
    };
    var onDown = function () {
      if (ws === socket) ws = null;
      scheduleReconnect(); // never resets the spider; never stops polling
    };
    socket.onclose = onDown;
    socket.onerror = onDown;
  }

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
    _connectWs: connectWs };

  poll();
  setInterval(poll, POLL_MS);
  setInterval(function () { if (lastState) renderAge(lastState); }, 1000);
  setConn("CONNECTING");
  connectWs();
})();
