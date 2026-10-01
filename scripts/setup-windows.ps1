# Run once from a native Windows checkout. Never changes agent approval settings.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $here
foreach ($exe in @('node', 'npm.cmd', 'claude', 'codex')) {
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
        throw "$exe is missing from PATH. Install the missing prerequisite, reopen the terminal, and rerun setup. See docs/windows-experiment.md."
    }
}
$major = [int]((& node --version) -replace '^v(\d+).*$', '$1')
if ($major -lt 22) { throw 'Use Node.js 22 or newer for this experiment and its tests.' }
& node --version
& claude --version
& codex --version
if (-not (Test-Path 'config.local.json')) {
    Copy-Item 'config.windows.example.json' 'config.local.json'
}
& npm.cmd install --omit=dev --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& node setup-hooks.js
if ($LASTEXITCODE -ne 0) { throw 'Claude hook setup failed.' }
& node setup-hooks-codex.js
if ($LASTEXITCODE -ne 0) { throw 'Codex hook setup failed.' }
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Validation failed. See the test output above.' }
Write-Host 'Setup complete. Run npm.cmd start, then open http://127.0.0.1:3456.'
Write-Host 'Start fresh Claude/Codex sessions. In Codex, use /hooks to review and trust the Ravenspire hooks.'
Write-Host 'Leave autostart off for the first experiment. Ctrl+C stops the foreground server.'
