# Windows-first Ravenspire experiment

This is an isolated experiment for Paul. It does not integrate with or modify
Paul's Software Factory. Keep the original RPG, panel and history views for the
first evaluation. Use a native Windows checkout and native Windows agent sessions.
No WSL, Omarchy, Docker, GPU, model server or API key is needed by Ravenspire itself.

## Install and start

Prerequisites on Windows 11: Git for Windows, Node.js 22 or newer (a supported LTS
release is preferable), Windows PowerShell 5.1 (`powershell.exe`, included in
Windows), and working, signed-in Claude Code and Codex installations. Ravenspire
does not authenticate or install the agents. Use current agent versions; older
Codex releases may not support this hook schema. Claude Code may also need Git
Bash available according to its Windows installation instructions.

Run in Windows PowerShell:

```powershell
git clone https://github.com/Paul-Osborn/ravenspire.git
Set-Location ravenspire
git switch experiment/windows-first
git remote add upstream https://github.com/Kapala-Solutions/ravenspire.git
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
npm.cmd start
```

Setup checks prerequisites, creates `config.local.json` from the Windows example
only if absent, installs the runtime dependency, merges both sets of hooks with
backups, and runs validation. It does not enable autostart. Existing local config
is retained, so check it if reusing an older installation. Use `npm.cmd` in
PowerShell to avoid an execution-policy error from the npm PowerShell shim.

Open **http://127.0.0.1:3456** in Edge or Chrome. Start fresh Claude Code and Codex
sessions in a small disposable project. Keep the Ravenspire terminal open. Use
`/#panel` for activity details and `/#history` for archives and response times.
For a stable browser cache and app install, consistently use the same hostname.

Before writing hooks, you can preview each merge:

```powershell
node setup-hooks.js --dry
node setup-hooks-codex.js --dry
```

If setup stops halfway, it reports which step failed; previously installed hooks
are safe to keep. Fix that prerequisite and rerun. The installers are idempotent.

## Claude Code connection

`node setup-hooks.js` merges seven lifecycle hooks into
`$env:USERPROFILE\.claude\settings.json` (or `CLAUDE_CONFIG_DIR\settings.json` if
set). Existing unrelated hooks and settings remain. Existing files receive a
timestamped `.bak-ravenspire-*` backup.

SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, Notification and
SessionEnd run `send-event.ps1` using an absolute path. The script reads JSON on
stdin, posts a normalized event to `/event`, and produces no decision output.
Local Claude transcripts supply the first prompt, last assistant message, model,
usage and approximate API cost. These numbers are estimates, not subscription
billing or actual dollars saved.

Restart sessions after installation; inspect `/hooks` in Claude if events are
missing. Administrative restrictions or disabled hooks can prevent capture.
This does not automatically monitor remote/cloud Claude sessions. The separate
Claude Desktop Cowork log watcher is disabled in the example to keep this first
test focused on CLI/IDE hooks; it can be enabled later with `watchDesktop: true`.

## Codex connection

`node setup-hooks-codex.js` merges hooks into
`$env:USERPROFILE\.codex\hooks.json` (or `CODEX_HOME\hooks.json` if set). The Windows
handler is `commandWindows`, invoking `powershell.exe`; the existing `pwsh`
command remains for upstream cross-platform compatibility.

**Open `/hooks` inside a native local Codex CLI session and review/trust the
Ravenspire hooks.** Current Codex skips new or changed non-managed hooks until
their exact definitions are trusted. Setup does not bypass that protection.
Hooks are enabled by default in current Codex; check `[features] hooks = false`
or managed restrictions if they do not run. Re-review after moving this checkout
or changing the port because the hook commands change.

Events: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse,
PermissionRequest, Stop and SessionEnd. Codex events use `source: codex`, with
prompt and last response from payloads. Current Codex supports SessionEnd;
closing normally can archive the session, while crashes still rely on stale
timeouts. This hook has an explicit three-second timeout.

Use the local CLI first. Desktop/IDE behavior depends on the installed runtime
and must be verified separately. These local PowerShell hooks are not a route
for monitoring cloud-orchestrated ChatGPT Work or remote Codex execution.

**Codex token usage and API cost are unavailable and display zero.** Its token-
driven levels, gear and monster scaling consequently remain at the baseline.
The server does calculate labor estimates from event gaps for both providers,
despite upstream README text claiming Codex labor stays zero. Treat that figure
as a fictional salary comparison, not money earned or a measured saving.

## Local state and settings

All runtime files live in the checkout beside `server.js`; there is no database.

| File / location | Content |
| --- | --- |
| `sessions.json` | Live sessions, personas, tool counts, attention state and metrics; loaded on restart |
| `sessions-history.jsonl` | Durable session snapshots on end or clear |
| `responses.jsonl` | Resolved waits, including reply, resume, focus or abandonment |
| `history.csv` | Aggregate metrics each minute and on session end |
| `config.json` | Tracked upstream defaults; leave unchanged for personal settings |
| `config.local.json` | Ignored local overrides and notification settings; overrides upstream defaults |
| Agent settings backups | Beside the Claude/Codex settings files, named `.bak-ravenspire-*` |
| Browser site data | PWA cache and UI preferences such as filters, sound and grouping |

State includes prompts, assistant text, project paths and command snippets.
Keep runtime files and settings private. They are gitignored; do not force-add
them. `config.local.json` is also excluded from static HTTP serving. Notification
settings saved through the UI now go there rather than into tracked defaults.
No phone push is configured for this test.

The server binds to **127.0.0.1** by default. It has no authentication and retains
upstream permissive CORS and control APIs. Do not publish it, port-forward it or
expose it to the network. A deliberate `host` override is available for future
upstream compatibility, but is outside this local experiment. Loopback does not
provide isolation from other local software or all browser-origin requests.

To change port, edit `port` in `config.local.json`, stop/restart the server and
rerun both hook installers. Avoid setting `PORT` independently: installers read
the config port. If 3456 is occupied, investigate the existing listener instead
of stopping unrelated Node applications.

## Stop, clear and reset

**Normal stop:** press Ctrl+C in the Ravenspire terminal. Pending session writes
are flushed before normal shutdown. Forced process termination and power loss
can still lose state. Hooks silently ignore an unavailable server and do not
replay missed events when it returns.

**Clear the board but keep history:** use Archive old in the panel, or clear a
specific session with `/clear`. `POST /clear {}` clears *all* sessions, including
active ones, after archiving them. Do not use this during a real work session.

**Full experiment reset:** stop Ravenspire and close agent sessions first. Move
the four state files into a timestamped local backup folder; the server creates
new ones when activity resumes:

```powershell
$backup = Join-Path 'experiment-backups' (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach ($file in @('sessions.json','sessions-history.jsonl','responses.jsonl','history.csv')) {
    if (Test-Path $file) { Move-Item $file $backup }
}
npm.cmd start
```

Keep `config.local.json` to preserve configuration. To reset UI preferences or a
stale offline PWA, clear site data for `127.0.0.1:3456` in the browser. This does
not erase server history. A cached page can open while the server is stopped;
check `/status` to distinguish a running service from an offline shell.

**Disconnect the agents:** remove only hooks whose command references this
checkout's `send-event.ps1` from each settings file. Keep unrelated hooks.
Alternatively restore the setup backup only if no subsequent settings changes
need preserving. Restart agent sessions. Do not delete an entire agent settings
file. Autostart was not installed; if later enabled, run
`powershell -NoProfile -ExecutionPolicy Bypass -File .\uninstall-autostart.ps1`.
Removing the startup shortcut does not stop an already-running server. For a
hidden instance, `Invoke-RestMethod -Method Post http://127.0.0.1:3456/restart`
actually stops it; the upstream route name is misleading and does not relaunch.

## Real-work evaluation

Use a harmless scratch project for one Claude and one Codex session. Record
`node --version`, `claude --version`, `codex --version`, Windows version and the
experiment commit. Avoid another copy of Ravenspire pointing to the same port.

| Action | Expected visible result |
| --- | --- |
| Start each agent and send a prompt | Two separately badged heroes, a task and activity line |
| Ask each to inspect files and run a harmless command | Tool count and battle log change during work |
| Encounter a normal approval/input request | Waiting/attention marker; Codex PermissionRequest or Claude Notification appears in `/status` |
| Respond/approve through the agent's usual interface | Attention clears after prompt/tool activity; response record appears for waits over 500ms |
| Agent finishes its turn | Idle state plus “Finished — your turn” attention marker |
| Click its focus/open-folder action | Correct Windows window/folder opens; verify which terminal tab is selected |
| End a session normally | Ended state and one durable archive entry |
| Restart Ravenspire | Live state/history survive; fresh activity continues |

`GET /status` shows recent raw normalized events and connected client count.
`GET /sessions` shows the corresponding server state. These are the first checks
when a hero does not appear. Sound is opt-in. Test the notification button and
check Windows Do Not Disturb if no toast appears; a successful API response only
reports configured channels, not successful delivery.

This checklist is **pending real agent execution on Paul's laptop**. Synthetic
test traffic proves the transport/state path, not that the installed agents
deliver every event. Do not claim the experiment is accepted until both agents
pass it. Then spend a real work session judging whether the visual makes it
easier to see who needs attention and what they are doing.

## Compatibility references (checked 2026-10-01)

- [Claude Code hook reference](https://code.claude.com/docs/en/hooks)
- [Codex hook discovery, trust and event schema](https://learn.chatgpt.com/docs/hooks)
- [Upstream project](https://github.com/Kapala-Solutions/ravenspire)

See [inspection and validation](experiment-review.md) for limitations and the
small fork changes. Preserve the MIT license and upstream attribution.
