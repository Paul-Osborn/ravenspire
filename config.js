// Shared config loader: keep upstream defaults, allow untracked local settings.
const fs = require('fs');
const path = require('path');

const LOCAL_CONFIG_FILE = path.join(__dirname, 'config.local.json');
function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}
function loadConfig() {
  let base = {};
  let local = {};
  try { base = readJSON(path.join(__dirname, 'config.json')); } catch {}
  if (fs.existsSync(LOCAL_CONFIG_FILE)) local = readJSON(LOCAL_CONFIG_FILE);
  return { ...base, ...local, notify: { ...base.notify, ...local.notify } };
}
module.exports = { loadConfig, readJSON, LOCAL_CONFIG_FILE };
