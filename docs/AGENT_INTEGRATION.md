# Connecting an AI Agent to SPIDER

This guide describes how to connect an agent to the existing SPIDER workspace without rebuilding the visual engine.

## Before you start

SPIDER currently has a working Muse-oriented telemetry path and a static frontend. The goal is to make additional agents pluggable through adapters. **Do not assume that generic multi-agent support already exists.**

Current endpoints used by the existing installation:

- Workspace: https://sabuncolek-maker.github.io/spider-workspace/
- Realtime browser stream: `wss://spider-realtime-poc.sabuncolek1508.workers.dev/ws`
- Authenticated event ingestion: `POST https://spider-realtime-poc.sabuncolek1508.workers.dev/event`

The browser-facing `/ws` endpoint is for receiving events. Do not post telemetry to `/ws`. Event publishers must use the authorized `/event` path and its server-side authentication mechanism.

The ingestion secret is managed outside this repository. Do not request that it be added to frontend files, query parameters, fixtures, or Git.

## Step-by-step integration

### 1. Identify how the agent exposes activity

Before writing an adapter, document the available source:

- Supported event hooks, callbacks, API, activity log, or database.
- Whether the source distinguishes tool start, completion, and failure.
- Whether it supplies timestamps, stable call IDs, task IDs, or session IDs.
- Whether it can be observed without changing the agent's core.
- Which data may be safely exported.

Do not assume that a different agent uses Muse's `agent.context_items` or any Muse-specific schema. If no reliable activity signal is available, report that limitation instead of fabricating events.

### 2. Build an agent-side adapter

Prefer a small adapter next to the agent runtime. Its responsibilities are:

1. Read or subscribe to supported activity.
2. Convert source events into a normalized SPIDER event.
3. Map the activity to a SPIDER node using explicit rules.
4. Add a unique event ID and source timestamp.
5. Remove private content and sensitive arguments.
6. Publish through the authenticated Worker ingestion endpoint.
7. Retry safely and avoid sending the same source event repeatedly.

Keep the adapter separate from `app.js`. The visual engine should not need to know the internals of every agent.

### 3. Verify the event contract before publishing

The existing frontend recognizes WebSocket messages with `type: "spider_event"` and event types including:

- `TOOL_STARTED`
- `TOOL_COMPLETED`
- `TOOL_FAILED`
- `TASK_STARTED`
- `TASK_COMPLETED`
- `TASK_FAILED`

The current frontend also uses fields such as `event_id`, `timestamp`, `seq` (when available), `tool`, `node`, `success`, and `task`. The exact ingestion schema accepted by the Worker must be verified against the current Worker implementation before creating an adapter. This document is not a substitute for that check.

A normalized event design for future adapters may look like:

```json
{
  "event_id": "stable-unique-event-id",
  "agent_id": "agent-instance-or-config-id",
  "session_id": "agent-session-id",
  "type": "spider_event",
  "event_type": "TOOL_STARTED",
  "timestamp": "2026-10-09T12:00:00.000Z",
  "seq": 42,
  "tool": "browser.search",
  "node": "SEARCH",
  "success": null,
  "task": "optional-safe-task-label"
}
```

This is a **design example**, not a claim that the current Worker already accepts `agent_id` or `session_id`. Confirm accepted fields and routing before sending them.

### 4. Use explicit node mapping

Use a reviewed mapping table based on what the tool actually does. Do not rely on a broad substring fallback if it could misclassify a specific tool.

Typical semantic examples:

| Activity meaning | SPIDER node |
|---|---|
| Start or manage a task/subagent | TASK or ANALYZE, according to the operation's real purpose |
| Search the web or search a source | SEARCH |
| Open/read/collect source material | COLLECT |
| Inspect, compare, or reason over information | ANALYZE |
| Authenticate or establish a connection | CONNECT |
| Validate a claim or run a check | VERIFY |
| Execute code or modify files | PROCESS |
| Produce a final result or options | RESULT |
| Successful task completion | COMPLETE |
| Actual task/tool failure | ERROR |
| No active work | IDLE / HUB |
| Unknown or unmapped activity | UNKNOWN |

This table is guidance, not a replacement for checking the current `app.js` mapping and the Python publisher mapping. Keep WebSocket and snapshot mappings consistent for equivalent activity. Preserve SYSTEM filtering for bridge/database observer activity.

### 5. Publish safely

- Publish from the adapter's trusted runtime, not from browser JavaScript.
- Use the existing authorized `POST /event` route.
- Read the required secret from the runtime's secret/environment configuration.
- Never print the secret or full request authorization headers.
- Send only minimal metadata. Do not send prompts, model reasoning, credentials, cookies, or full tool arguments.
- Use bounded retries and deduplication. A retry must not create repeated spider movement.
- Do not bypass authentication or change the Worker to accept unauthenticated writes.

The frontend's public WebSocket is not an authentication mechanism and must not be treated as a write API.

### 6. Test before enabling the adapter

At minimum, verify:

1. A real, safe activity from the agent is observed.
2. The adapter produces a valid event with a unique ID and valid timestamp.
3. The authorized Worker ingestion endpoint accepts it.
4. The browser receives the event over WebSocket.
5. The spider moves to the intended node.
6. Duplicate/retried events do not cause duplicate movement.
7. Tool completion updates the matching activity without creating an unintended second journey.
8. Failures and task completion are represented correctly.
9. The existing Muse path continues to work.
10. No secrets or private activity are present in the frontend, fixtures, state snapshot, or logs.

Run the repository checks:

```bash
node --check app.js
python3 -m json.tool state.json >/dev/null
```

These checks are necessary but not sufficient. They do not prove that a real event reaches the browser or that motion looks correct on a phone.

## Switching agents versus running several agents

### Replace Muse with one other agent

This is the simplest future integration: keep the workspace and Worker, implement a new adapter, and configure the telemetry source. It is possible only if the new agent exposes a reliable activity source and the adapter can publish the verified event contract.

### Run multiple agents at once

The current workspace must **not** be assumed to support this yet. A robust multi-agent implementation needs end-to-end support for:

- stable `agent_id` and `session_id`;
- per-agent event identity, sequencing, and deduplication;
- routing/storage separation in the Worker and Durable Object layer;
- frontend agent selection or a deliberate multi-spider layout;
- per-agent status, stale handling, and event history;
- workspace-level authorization and isolation.

Adding an `agent_id` field alone does not implement multi-agent support. Do not enable concurrent agents until the complete path has been designed and tested.

## Copy-ready prompt for a new agent

Give the agent access to this repository and paste the following prompt:

```text
Connect your activity telemetry to my existing SPIDER workspace.

Repository:
https://github.com/sabuncolek-maker/spider-workspace

Read README.md, AGENTS.md, and docs/AGENT_INTEGRATION.md first.

Do not rebuild SPIDER. Do not assume you have access to Muse-specific telemetry.
First perform a read-only audit of your own activity/event APIs and the existing
SPIDER event contract. Identify the reliable source of tool/task start, completion,
and failure events available to you.

Inspect the current Worker ingestion contract before designing an adapter.
The browser WebSocket is a receive stream, not the event-publishing endpoint.
Use only the authorized server-side POST /event path. Never expose secrets,
prompts, reasoning, credentials, or full tool arguments.

Design a small agent-side adapter that emits safe, normalized SPIDER events,
uses unique event IDs and valid timestamps, applies explicit node mapping, and
deduplicates retries. Preserve the existing Muse integration.

The current system is single-agent-oriented. Do not claim multi-agent support
or add agent_id fields and assume routing is complete; identify every backend,
storage, and frontend change required for multi-agent operation.

Initially, perform a read-only audit and return:
1. Verified activity source and its limitations.
2. Existing event contract and compatibility gaps.
3. Proposed adapter design.
4. Files/components that would need changes.
5. Security considerations and test plan.
6. Costs or additional infrastructure, if any.

Do not modify files, commit, merge, deploy, or change production configuration
until I explicitly approve the plan.
```

## Troubleshooting

- **The page loads but the spider does not move:** check that the bridge is running, the Worker accepted the event, the browser WebSocket received it, and the event maps to a valid node.
- **The connection says LIVE but data appears old:** socket connectivity and data freshness are separate. Inspect the latest event timestamp and bridge health.
- **Snapshot fallback works but realtime does not:** inspect the Worker/WebSocket route and browser console; do not put credentials in the URL as a workaround.
- **Events appear twice:** check source event IDs, retry behavior, and deduplication in the bridge and frontend.
- **A node is UNKNOWN or unexpected:** compare the actual tool name and explicit mapping in the adapter, Python publisher, and JavaScript frontend.
- **A new agent cannot be observed:** its platform may not expose the required activity signal. Report that limitation instead of inventing telemetry.
