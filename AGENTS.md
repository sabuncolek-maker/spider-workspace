# Rules for AI Agents and Contributors

These rules apply to every AI coding agent working in this repository.

## 1. Inspect before editing

- Read `README.md` and this file before changing code.
- For integration work, also read `docs/AGENT_INTEGRATION.md`.
- Inspect the current branch, latest `main`, related code, and open pull requests before editing.
- Treat old audit reports and `TESTLOG.md` as historical evidence. Verify claims against the current code.
- Clearly distinguish facts verified from source, tests actually run, assumptions, and work that could not be verified.

## 2. Protect the working system

- Do not rewrite SPIDER CORE just to accommodate one agent.
- Keep changes focused and minimal.
- Do not change spider routes, node coordinates, gait, inverse kinematics, animation timing, camera behavior, or reduced-motion support unless the task explicitly requires it.
- Do not remove nodes because they have not appeared in telemetry; verify the source mapping and product intent first.
- Do not replace live telemetry with fabricated or randomly generated activity.
- Never make the spider move based on an unverified assumption about what an agent is doing.
- Preserve the current Muse integration unless the user explicitly approves a migration.

## 3. Git and deployment workflow

- Never work directly on `main` for implementation changes.
- Create a focused branch from the latest `main`.
- Do not merge, deploy, change production Worker configuration, or modify production secrets without explicit user approval.
- Do not overwrite another branch's work. Inspect branch state and diffs first.
- Keep documentation changes separate from behavior changes when practical.
- Open a pull request with a summary, changed files, tests, risks, and any unverified behavior.
- Do not claim a change is live merely because it was pushed to a branch.

## 4. Telemetry contract

- Verify the current Worker and frontend contract before changing event fields or event types.
- Keep event identity stable and unique; preserve timestamps and sequence information where available.
- Distinguish event receipt from actual agent activity. WebSocket connection alone is not proof of fresh data.
- Do not interpret silence as proof that an agent is stuck.
- Treat `db` / bridge-observer activity as SYSTEM where the current bridge classifies it that way; do not let system polling move the spider as if it were user work.
- Do not change mapping rules based only on broad substring matches without checking specific tool names and precedence.
- Keep the WebSocket event stream and `state.json` fallback behavior consistent where both represent the same activity.

## 5. Security and privacy

- Never commit, print, or expose secrets, tokens, cookies, private prompts, raw internal databases, or full tool arguments.
- Never put `SPIDER_BRIDGE_SECRET` or any ingestion credential in `app.js`, `index.html`, `state.json`, fixtures, URLs, browser storage, or public logs.
- Event publishing must use the authorized server-side ingestion path. Do not use the public browser WebSocket as an event-publishing shortcut.
- Send metadata only: event ID, event type, safe tool name, mapped node, status, timestamp, and required task/agent identifiers.
- Do not weaken authentication or isolation to make an integration easier.
- Treat GitHub Pages files as public, including fixtures and commit history.

## 6. Adding an agent

- Implement an adapter at the agent/runtime boundary when possible.
- Do not assume every agent has Muse's database, schema, or telemetry API.
- First prove that the agent exposes a reliable supported activity signal.
- Normalize events to the verified SPIDER contract; do not invent events the source cannot confirm.
- Use a stable `agent_id` and `session_id` in the adapter design, but do not assume the current production pipeline fully supports multi-agent routing.
- Do not claim multi-agent support until identity, routing, storage, frontend behavior, and isolation have all been tested end-to-end.
- Read and follow `docs/AGENT_INTEGRATION.md`.

## 7. Required checks and honest reporting

Run the checks applicable to the change and report exact results:

```bash
node --check app.js
python3 -m json.tool state.json >/dev/null
```

Also use relevant fixtures and inspect the diff. For behavior changes, add or run targeted tests where possible.

- A syntax check is not a browser runtime test.
- A mock/fake-DOM test is not a real-device visual test.
- If WebSocket, mobile, or live status behavior could not be tested, say so explicitly.
- Investigate failing tests; do not dismiss a failure as an old artifact without comparison evidence.
- Report files changed, commit/branch, tests passed/failed/not run, known risks, and whether merge/deploy has been performed.

## 8. Stop conditions

Stop and ask for approval before:
- changing production infrastructure or credentials;
- altering the ingestion authentication model;
- introducing paid services or a VPS;
- migrating or deleting existing telemetry sources;
- enabling multi-agent routing in production;
- merging or deploying a change when approval has not been given.
