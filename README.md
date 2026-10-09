# SPIDER Workspace — by Erlangga

SPIDER is a lightweight, browser-based visual workspace for observing AI-agent activity. A small spider moves across task nodes when the workspace receives valid telemetry events. The project is designed to reuse the same visual engine with different agent adapters over time.

**Live workspace:** https://sabuncolek-maker.github.io/spider-workspace/  
**Repository:** https://github.com/sabuncolek-maker/spider-workspace

> **Current integration status:** Muse is the existing telemetry source. The frontend has a realtime WebSocket path and a `state.json` snapshot fallback. A generic adapter interface, agent registry, agent switcher, and full multi-agent isolation are design goals—not implemented features yet.

## What it does

- Visualizes activity on the SPIDER node map: TASK, SEARCH, COLLECT, ANALYZE, CONNECT, VERIFY, PROCESS, RESULT, COMPLETE, ERROR, UNKNOWN, and IDLE/HUB.
- Receives realtime activity events over WebSocket when the bridge is connected.
- Polls `state.json` every 7 seconds as a snapshot/fallback path.
- Reconnects to WebSocket with backoff and keeps snapshot polling available.
- Shows recent activity and task/tool status from the available telemetry.
- Uses deterministic route paths and motion; the visual engine should not invent agent activity.
- Runs as a static site without a frontend build step or JavaScript package dependencies.

## Architecture today

```text
Muse activity source
  -> action_bridge.py (outside this repository)
  -> authenticated POST /event
  -> Cloudflare Worker
  -> Durable Object / realtime room
  -> WebSocket
  -> app.js
  -> node mapping, visual queue, spider movement

Snapshot/fallback:
publisher (outside this repository)
  -> state.json
  -> frontend polling every 7 seconds
```

The frontend source is in this repository. The Muse observer/bridge and Worker source are maintained separately; this repository alone is not the entire telemetry backend.

### Important current limitations

- The bridge currently observes Muse-specific activity sources. Other agents need their own adapter or an explicitly supported activity source.
- The workspace currently behaves as a single-agent view. Do not assume concurrent multi-agent routing or per-agent isolation is supported.
- The WebSocket being connected means the transport is connected; it does not by itself prove that the agent is active or that telemetry is fresh.
- Snapshot age and realtime activity are different signals. A stale snapshot is not proof that the agent is stuck.
- The in-browser movement traces and recent visual event history are not a durable, cross-device event-history store.
- Some nodes may not be reached by the current source's tool mapping. A node existing in the visual map does not mean telemetry currently maps to it.
- The public `/ws` endpoint is a browser-facing realtime stream. Event publishing must use the authorized server-side `/event` path; never put the bridge secret in frontend code.

## Run locally

Requirements: Python 3 (only for a simple local HTTP server) and a modern browser.

```bash
git clone https://github.com/sabuncolek-maker/spider-workspace.git
cd spider-workspace
python3 -m http.server 8077
```

Open http://127.0.0.1:8077/.

Use the bundled fixtures to inspect snapshot rendering without connecting to live telemetry:

```text
http://127.0.0.1:8077/?src=fixture-idle.json
http://127.0.0.1:8077/?src=fixture-search.json
http://127.0.0.1:8077/?src=fixture-stale.json
http://127.0.0.1:8077/?src=fixture-error.json
```

The fixture parameter changes the snapshot source only. Realtime WebSocket activity may still arrive unless you override the socket URL or test offline.

## Configuration

The frontend uses query parameters for local/testing overrides:

- `src`: snapshot JSON URL; defaults to `state.json`.
- `ws`: WebSocket URL; defaults to the project's configured Cloudflare Worker `/ws` endpoint.

Example for a custom snapshot file:

```text
http://127.0.0.1:8077/?src=fixture-search.json
```

Do not add secrets or private telemetry to query parameters, fixtures, `state.json`, or any frontend file.

## Connect another AI agent

Start with [Agent Integration Guide](docs/AGENT_INTEGRATION.md). It explains the adapter pattern, the event contract to verify, security boundaries, and the required test sequence.

At a high level:

1. Identify how the new agent exposes observable activity (events, callbacks, API, or logs).
2. Build a small adapter at the agent/runtime side; do not rewrite SPIDER CORE to fit one agent.
3. Normalize only safe metadata into SPIDER-compatible events.
4. Publish through the authorized Worker ingestion endpoint using a server-side secret.
5. Verify node mapping, deduplication, timestamps, failure handling, and the existing Muse path.
6. Add concurrent/multi-agent support only after event identity and isolation have been designed end-to-end.

A GitHub connection alone does not connect an agent to SPIDER. The agent also needs a reliable way to observe its own activity and a secure path to publish telemetry.

## Development and review rules

Read [AGENTS.md](AGENTS.md) before asking an AI coding agent to modify this repository.

Minimum checks before proposing a change:

```bash
node --check app.js
python3 -m json.tool state.json >/dev/null
```

Use the fixture URLs for snapshot smoke tests. These checks do not replace browser runtime tests for WebSocket behavior, visual motion, mobile rendering, or status transitions. Record any tests that could not be run; do not report them as passing.

Recommended workflow:

1. Inspect the current branch and relevant code before editing.
2. Create a focused branch from the latest `main`.
3. Make the smallest change that addresses the task.
4. Run applicable checks and document results in the pull request.
5. Open a pull request; do not merge or deploy without explicit approval.

## Repository map

| Path | Purpose |
|---|---|
| `index.html` | Workspace markup, SVG layers, brand, and script/style entry points |
| `style.css` | Visual styling, responsive layout, status and motion styling |
| `app.js` | Snapshot polling, WebSocket client, event handling, node mapping, queue, routes, and spider motion |
| `state.json` | Public snapshot consumed by the static frontend; must contain no secrets or private raw data |
| `fixture-*.json` | Safe test snapshots for local smoke tests |
| `TESTLOG.md` | Historical test notes; verify against the current code before relying on them |
| `push_snapshot.sh` | Snapshot publication helper; inspect before use because it can publish a repository change |
| `docs/AGENT_INTEGRATION.md` | Guide for connecting a new agent through an adapter |
| `AGENTS.md` | Required rules for AI agents and contributors |

## Privacy and security

- Never commit API keys, bridge secrets, tokens, cookies, private prompts, tool arguments, or raw internal databases.
- Treat all frontend assets and GitHub Pages content as public.
- Do not expose the Worker secret in browser JavaScript or browser-visible configuration.
- Do not send full prompts, credentials, or sensitive tool arguments as telemetry; use event metadata only.
- Preserve the current authorized event-ingestion boundary and do not weaken authentication to make an adapter easier to connect.

## Project status

SPIDER is an evolving project. The existing Muse integration and visual workspace are implemented; reusable adapters and robust multi-agent operation require additional work. See [TESTLOG.md](TESTLOG.md) for recorded checks, keeping in mind that historical results are not proof that the latest commit has been tested in a real browser.
