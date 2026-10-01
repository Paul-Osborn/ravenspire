# Ravenspire experiment inspection and validation

Inspected 2026-10-01 against upstream `main` commit
`a0db9d99405bab10a28e3789f0e0e6fdd87f0b32`.
Experiment branch: `experiment/windows-first`. No Factory repository changes,
orchestration integration or UI redesign are part of this work.

## Architecture and event flow

| Area | Files | Behavior |
| --- | --- | --- |
| Runtime | `package.json`, `server.js` | CommonJS Node HTTP/WebSocket service, no build pipeline; runtime dependency `ws`; Playwright dev dependency is only for demo recording |
| Hook installation | `setup-hooks.js`, `setup-hooks-codex.js` | Merge lifecycle command hooks with backups; generated absolute script path and configured port |
| Event bridge | `send-event.ps1` | Reads agent JSON on stdin, extracts session/tool/task fields, detects IDE/window ancestry on selected events, posts `/event` with a two-second request timeout |
| Session state | `server.js` | Map keyed by session ID, lifecycle state + independent needsAttention flag, debounced JSON persistence and WebSocket session snapshots |
| Tool animation | `server.js`, `rpg.html` | Normalized pre-tool events also emit legacy `tool_start` packets, which drive animated strikes; the current RPG depends on this legacy channel |
| Claude enrichment | `transcript.js` | Reads the entire referenced JSONL synchronously on events; usage deduplication by message ID, first prompt, latest text, model, estimated cost and capped timestamp gaps |
| Codex enrichment | `server.js` | Takes prompt/model/last response directly from hooks; deliberately bypasses Claude transcript parser |
| Identity / labor | `persona.js`, `roles.js`, `activity.js` | Session-derived hero identity, project-keyword inferred role, salary-table comparison and readable tool activity |
| Desktop fallback | `desktop-watcher.js` | Windows-only two-second tail of `%APPDATA%\Claude\logs\main.log`; extracts undocumented LocalSessions lines; disabled for initial experiment |
| Original UI | `app.html`, `rpg.html`, `dashboard.html`, `history.html` | Shell keeps three iframe views mounted; RPG canvas + hero sheets; panel groups/filter/rename/focus controls; history polls CSV/JSONL API views |
| App install | `manifest.webmanifest`, `sw.js`, icons | PWA shell/static cache; dynamic data/control endpoints bypass caching; local browser preferences stored under legacy `aihq-*` keys |
| Native Windows | `focus-window.ps1`, `notify.ps1`, `install-autostart.ps1`, `uninstall-autostart.ps1`, `start-aihq.vbs` | user32 focus/restore, WinRT toast, Startup shortcut and hidden Node launcher; legacy file names retained for compatibility |
| Supporting assets | `generate-icons.js`, `scripts/*`, screenshots/video | Procedural icon generator; synthetic demo seed/history/recording harness. Demo tooling is not a real agent acceptance test |
| Design history | `docs/superpowers/*`, `.claude/launch.json` | Earlier product specifications and branding plan, plus a local launch recipe; these do not override experiment scope |

Lifecycle events create/update sessions. Start/prompt/tool activity produce active
states; notifications and permission requests produce waits; Stop makes a session
idle but still marks it as needing attention. New activity clears that marker.
SessionEnd archives. Quiet sessions become idle after 15 minutes; a stuck alert
can be abandoned after 45 minutes. A missing event is not reconstructed later.

The server emits complete session snapshots, then legacy animation events. UI
parties group by host + IDE + lowercased working directory. Different agent IDEs
in the same project can therefore appear in different parties. The RPG shows at
most 16 heroes. The dashboard provides more operational detail than the canvas.

## What limits the experiment

| Finding | Consequence / current handling |
| --- | --- |
| GitHub connector exposes no fork operation; no authenticated GitHub CLI in this workspace | Created the requested native org fork through GitHub's browser workflow after sign-in; verified “forked from Kapala-Solutions/ravenspire.” Publish experiment changes through the connector and keep main at upstream |
| This workspace is Linux, with no connection to Paul's Windows laptop | Windows bridge validation passed on GitHub's Windows Server 2025 runner; Windows 11 desktop behavior and real agent acceptance still need Paul's laptop |
| Codex requires trust of non-managed hook definitions | Use `/hooks`; silently writing hooks is insufficient; no trust bypass added |
| Current Codex supports SessionEnd, contrary to upstream installer comments | Add this hook with a three-second timeout so normal exits can archive; update old Codex clients |
| Native local hooks cannot reach this laptop from cloud orchestration | Use native Windows local CLI sessions initially; do not expect this Work cloud thread to appear |
| Codex token/cost parser is absent | Zero means unavailable, not free usage. Codex has baseline XP/gear/monster scaling; labor estimates still accrue from event gaps |
| RPG combat/HP/roles/labor are presentation estimates | Monster damage uses random/timed animation, not completed work; tool attacks are event-driven but not QA evidence; victories do not certify correctness |
| `/focus` acknowledges/clears attention before proving focus worked | Clicking an agent can hide a still-blocked alert and count as a response. Compare agent terminal state during evaluation |
| Native focus captures a window, not a reliable terminal tab | Multi-tab terminals/IDEs and foreground fallback can focus the wrong tab/window; verify on Paul's desktop |
| Claude Notification is not filtered to only approval events | Other notification types may produce false waits; test accuracy rather than assuming all alerts mean blocking |
| Full transcript read on each Claude event | Large sessions may add disk/CPU overhead; PowerShell process launch and WMI ancestry also add per-event overhead; benchmark real work before expanding |
| Hook delivery is best-effort; no spool/retry or heartbeat | Server downtime loses activity; long thinking periods can look stale; no crash-proof live status |
| Archives are one snapshot per session | Resuming an already archived session may leave the historical row stale; archive history is not an authoritative event ledger |
| Metrics are approximations | Hardcoded model-family pricing may be stale; streaming usage dedupe and mixed-model sessions need validation; this is not subscription billing/accounting |
| Upstream autostart uses VBScript + PATH Node | Availability depends on Windows VBScript/WSH and login PATH; leave autostart disabled until foreground mode works |
| Data contains agent/project content; upstream service has no auth | Default to loopback; exclude config/source/state from static serving; do not deploy it as a public service |

The upstream issues collection contained three closed pull-request entries
(#1 Cowork/PWA/history/grouping, #2 README/setup documentation, #3 follow-up
Cowork/PWA/history/grouping), with no open issue establishing Windows or current
Codex compatibility. The code and a real run remain the relevant evidence.

## Minimal changes from upstream

1. Shared configuration loader overlays ignored `config.local.json`, supports
   UTF-8 BOM, and fails visibly for malformed local overrides. Notification
   settings save locally instead of dirtying/publishing `config.json`.
2. Server defaults to loopback and serves an explicit list of original UI
   assets. Source, credentials, state files and `.git` cannot be downloaded by
   guessing static paths. Existing operational data APIs remain available.
3. Pending state flushes on normal shutdown and the upstream `/restart` stop
   route. Removed unused LAN-address enumeration, which failed in this sandbox.
4. Claude hook command uses `-File` with a quoted path rather than a PowerShell
   single-quoted expression that broke checkout paths containing apostrophes.
   Both installers accept BOM settings and respect custom agent config homes.
5. Hook bridge reads/sends UTF-8 explicitly and exits successfully when the
   server is unavailable. Current Codex receives SessionEnd and trust guidance.
6. Windows setup helper, runbook, isolated Node tests and a Windows Actions
   workflow. No new runtime dependency, UI edits, Factory adapters or broad
   application rewrite. MIT license/attribution remain intact.

These are deliberately small infrastructure changes. Keep upstream `main`
clean; merge experiment work only after a real test. Hooks/config defaults and
static assets may need small conflict resolutions when pulling upstream changes.

## Validation

Ran locally using Node **v24.19.0**, installed runtime dependency with
`npm install --omit=dev --ignore-scripts --no-audit --no-fund`.

| Check | Result |
| --- | --- |
| `npm test`: hook merge/backups/BOM/dry-run/idempotence/invalid JSON | Pass |
| `npm test`: custom Claude/Codex config homes | Pass |
| `npm test`: HTTP/WebSocket events, Claude transcript, Codex task/tool/approval/stop/end, responses, archive, local config, restart persistence | Pass |
| `npm test`: native Windows PowerShell syntax and installed-command Unicode delivery | Skipped locally (Linux); passed on Windows CI |
| `node --check` on all Node files and extracted inline scripts in all four HTML views | Pass |
| `git diff --check` | Pass |
| Rendered UI browser smoke test | Not completed: Chromium was absent and the attempted browser download returned an invalid archive. HTTP assets and inline script syntax validated; visual acceptance remains pending |
| Windows GitHub Actions workflow | Passed all 4 tests, 0 failures, 0 skips, on Windows Server 2025 with Node v22.23.3; [run 36869958944](https://github.com/Paul-Osborn/ravenspire/actions/runs/36869958944), tested commit `f7c4d758dbb9011dc7eed0519392c2ed1588e5a8` |
| Real Claude Code/Codex on Paul's Windows laptop | Pending; no laptop access in this session |

There was no upstream `test` script or CI workflow at the inspected commit.
Existing demo tooling uses synthetic data and requires a browser + ffmpeg.
Tests run in temporary copies and leave global agent settings untouched.

## Upstream workflow and experiment boundary

The native GitHub fork was created and its upstream parent was verified. The
published experiment has [draft PR #1](https://github.com/Paul-Osborn/ravenspire/pull/1);
main remains at the inspected upstream commit. The Windows checkout uses `origin` for
`Paul-Osborn/ravenspire` and `upstream` for `Kapala-Solutions/ravenspire`.
Use an actual GitHub fork, keeping its parent relationship. On a clean checkout:

```powershell
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
git switch experiment/windows-first
```

Reconcile upstream changes onto the experiment branch separately and rerun
validation; do not reset/rewrite published experiment history or force-push main.
Do not use Factory Forgejo policy as a reason to change this explicitly requested
GitHub experimental fork. No changes belong in `pauls-software-factory` yet.

If this proves useful later, preserve the architectural direction:
**Paul's Software Factory state/events -> visualization**. Factory state stays
authoritative. Ravenspire's inferred waits, estimates, random combat and local
session store must not become a second orchestration system or independently
decide Factory truth. That integration is deferred.
