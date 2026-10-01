const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');
const WebSocket = require('ws');
const ROOT = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function fixture(t, beforeCleanup) {
  // Spaces and apostrophe exercise Windows hook command quoting.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ravenspire Paul's experiment "));
  for (const name of fs.readdirSync(ROOT)) {
    if (/\.(js|html|ps1|png|svg|webmanifest)$/.test(name)) fs.copyFileSync(path.join(ROOT, name), path.join(dir, name));
  }
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ port: 3456, watchDesktop: false, notify: { toast: false } }));
  t.after(async () => {
    if (beforeCleanup) await beforeCleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

test('hook installers preserve other hooks, backup, handle BOM, and rerun without duplication', t => {
  const dir = fixture(t);
  fs.writeFileSync(path.join(dir, 'config.local.json'), '\uFEFF' + JSON.stringify({ port: 3467 }));
  for (const [script, flag, file, count] of [
    ['setup-hooks.js', '--settings', 'claude.json', 7],
    ['setup-hooks-codex.js', '--hooks', 'codex.json', 7],
  ]) {
    const target = path.join(dir, file);
    const original = '\uFEFF' + JSON.stringify({ custom: true, hooks: { PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command: 'my-existing-hook' }] }] } });
    fs.writeFileSync(target, original);
    const run = extra => spawnSync(process.execPath, [path.join(dir, script), flag, target, ...extra], { encoding: 'utf8' });
    assert.equal(run(['--dry']).status, 0);
    assert.equal(fs.readFileSync(target, 'utf8'), original);
    assert.equal(run([]).status, 0);
    const first = fs.readFileSync(target, 'utf8');
    assert.equal(run([]).status, 0);
    assert.equal(fs.readFileSync(target, 'utf8'), first);
    const settings = JSON.parse(first);
    assert.equal(settings.custom, true);
    assert.equal(Object.keys(settings.hooks).length, count);
    assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, 'my-existing-hook');
    const installed = settings.hooks.SessionStart[0].hooks[0];
    assert.match(installed.command, /-File ".*Paul's experiment .*send-event\.ps1"/);
    assert.match(installed.command, /127\.0\.0\.1:3467/);
    if (script.includes('codex')) {
      assert.match(installed.commandWindows, /^powershell /);
      assert.equal(settings.hooks.SessionEnd[0].hooks[0].timeout, 3);
    }
    assert.ok(fs.readdirSync(dir).some(name => name.startsWith(file + '.bak-ravenspire-')));
    fs.writeFileSync(target, '{broken');
    assert.equal(run([]).status, 1);
    assert.equal(fs.readFileSync(target, 'utf8'), '{broken');
  }
});

test('honor custom agent config directories without touching user settings', t => {
  const dir = fixture(t);
  for (const [script, envName, file] of [
    ['setup-hooks.js', 'CLAUDE_CONFIG_DIR', 'settings.json'],
    ['setup-hooks-codex.js', 'CODEX_HOME', 'hooks.json'],
  ]) {
    const custom = path.join(dir, envName);
    const result = spawnSync(process.execPath, [path.join(dir, script)], { env: { ...process.env, [envName]: custom }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(custom, file)));
  }
});

test('HTTP/WebSocket lifecycle, Claude transcript, Codex activity, archive and shutdown persistence', { timeout: 30000 }, async t => {
  const children = [];
  const dir = fixture(t, async () => {
    for (const child of children) if (child.exitCode === null) {
      const ended = new Promise(resolve => child.once('exit', resolve));
      // HTTP shutdown exercises graceful persistence on Windows too.
      try { await fetch(base + '/restart', { method: 'POST' }); } catch { child.kill(); }
      await ended;
    }
  });
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  async function start() {
    const child = spawn(process.execPath, [path.join(dir, 'server.js')], {
      cwd: dir, env: { ...process.env, PORT: String(port), NODE_PATH: path.join(ROOT, 'node_modules') }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(output);
      try { if ((await fetch(base + '/status')).ok) return child; } catch {}
      await delay(50);
    }
    throw new Error('Server did not start: ' + output);
  }
  let child = await start();
  const get = async route => (await fetch(base + route)).json();
  const post = async (route, body) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const ws = new WebSocket(base.replace('http:', 'ws:'));
  const messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw)));
  t.after(() => ws.terminate());
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  for (const route of ['/', '/rpg', '/dashboard', '/history', '/sw.js', '/manifest.webmanifest', '/icon-192.png']) {
    assert.equal((await fetch(base + route)).status, 200, route);
  }
  for (const route of ['/config.json', '/config.local.json', '/sessions.json', '/.git/config', '/server.js', '/..\\config.json']) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
  const tx = path.join(dir, 'claude-fixture.jsonl');
  fs.writeFileSync(tx, [
    { timestamp: '2026-10-01T12:00:00Z', message: { role: 'user', content: 'Inspect this experiment' } },
    { timestamp: '2026-10-01T12:00:01Z', message: { role: 'assistant', id: 'm1', model: 'claude-sonnet-test', content: [{ type: 'text', text: 'Ready for review.' }], usage: { input_tokens: 100, output_tokens: 20 } } },
  ].map(JSON.stringify).join('\n'));
  const event = async (source, type, more = {}) => {
    assert.equal((await post('/event', { sessionId: source, source, type, hookEvent: type, title: 'experiment', cwd: "C:/Paul's Projects", ...more })).status, 200);
    return (await get('/sessions')).find(s => s.sessionId === source);
  };
  let s = await event('code', 'SessionStart', { transcriptPath: tx });
  assert.equal(s.tokens.total, 120);
  assert.equal(s.task, 'Inspect this experiment');
  assert.equal(s.lastMessage, 'Ready for review.');
  s = await event('codex', 'UserPromptSubmit', { prompt: 'Inspect Codex activity', model: 'codex-test', transcriptPath: tx });
  assert.equal(s.task, 'Inspect Codex activity');
  assert.equal(s.tokens.total, 0);
  assert.equal(s.cost, 0);
  s = await event('codex', 'PreToolUse', { tool: 'exec_command', target: 'node --version' });
  assert.equal(s.state, 'working');
  assert.equal(s.toolCount, 1);
  s = await event('codex', 'PermissionRequest', { target: 'approval test' });
  assert.equal(s.needsAttention, true);
  assert.equal(s.state, 'waiting');
  await delay(600);
  s = await event('codex', 'PostToolUse', { tool: 'exec_command' });
  assert.equal(s.needsAttention, false);
  assert.equal(s.currentTool, null);
  assert.equal((await get('/responses'))[0].via, 'resumed');
  s = await event('codex', 'Stop', { lastMessage: 'Done.' });
  assert.equal(s.lastMessage, 'Done.');
  assert.equal(s.needsAttention, true);
  s = await event('codex', 'SessionEnd');
  assert.equal(s.state, 'ended');
  assert.equal(s.needsAttention, false);
  await post('/clear', { sessionId: 'codex' });
  assert.equal((await get('/history/sessions')).filter(s => s.sessionId === 'codex').length, 1);
  assert.match(await (await fetch(base + '/history.csv')).text(), /timestamp,sessions/);
  assert.ok(messages.some(m => m.type === 'sessions' && m.sessions.some(s => s.source === 'codex')));
  assert.ok(messages.some(m => m.type === 'tool_start' && m.tool === 'exec_command'));
  // Settings must land in the ignored file, not change upstream config.json.
  const originalConfig = fs.readFileSync(path.join(dir, 'config.json'), 'utf8');
  await post('/notify-config', { toast: false, stops: false, remindMinutes: 0 });
  assert.equal(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'), originalConfig);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'config.local.json'))).notify.stops, false);
  const bad = await fetch(base + '/event', { method: 'POST', body: '{broken' });
  assert.equal(bad.status, 400);
  await event('code', 'Notification', { message: 'Wait for Paul' });
  // Stop within the 500ms debounce window: final event must survive restart.
  const ended = new Promise(resolve => child.once('exit', resolve));
  await post('/restart', {});
  await ended;
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'sessions.json'))).find(s => s.sessionId === 'code').needsAttention, true);
  ws.terminate();
  child = await start();
  assert.equal((await get('/sessions')).find(s => s.sessionId === 'code').attentionReason, 'Wait for Paul');
});

test('Windows PowerShell parses scripts and forwards Unicode hook JSON', { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
  const dir = fixture(t);
  for (const file of fs.readdirSync(ROOT).filter(name => name.endsWith('.ps1')).concat('scripts/setup-windows.ps1')) {
    const script = path.join(ROOT, file).replace(/'/g, "''");
    const result = spawnSync('powershell', ['-NoProfile', '-Command', `$e=$null; $t=$null; [System.Management.Automation.Language.Parser]::ParseFile('${script}',[ref]$t,[ref]$e) | Out-Null; if ($e.Count) { $e | Out-String | Write-Error; exit 1 }`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  let received;
  const http = require('http');
  const sink = http.createServer((req, res) => {
    let raw = '';
    req.setEncoding('utf8'); req.on('data', chunk => { raw += chunk; });
    req.on('end', () => { received = JSON.parse(raw); res.end('{}'); });
  });
  await new Promise(resolve => sink.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => sink.close(resolve)));
  const endpoint = `http://127.0.0.1:${sink.address().port}`;
  // Execute the installed Windows command with piped input, including apostrophe path.
  const hooks = path.join(dir, 'hooks.json');
  assert.equal(spawnSync(process.execPath, [path.join(dir, 'setup-hooks-codex.js'), '--hooks', hooks]).status, 0);
  const command = JSON.parse(fs.readFileSync(hooks)).hooks.PreToolUse[0].hooks[0].commandWindows;
  // Generated config points at 3456; replace only the endpoint for this isolated sink.
  const child = spawn(command.replace('http://127.0.0.1:3456', endpoint), { shell: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let errors = ''; child.stderr.on('data', chunk => { errors += chunk; });
  const ended = new Promise(resolve => child.once('exit', resolve));
  child.stdin.end(JSON.stringify({ session_id: 'windows-bridge', cwd: "C:/Paul's Projects", hook_event_name: 'PreToolUse', tool_name: 'exec_command', tool_input: { command: 'echo café 日本語' } }));
  assert.equal(await ended, 0, errors);
  assert.equal(received.source, 'codex');
  assert.equal(received.sessionId, 'windows-bridge');
  assert.equal(received.target, 'echo café 日本語');
});
