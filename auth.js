/**
 * auth.js (server)
 *
 * Gates write/edit/delete on posts behind a single shared password.
 * The password hash lives in posts/auth.json so it travels with the same
 * git-sync mechanism as posts and images (see dataSync.js) and survives
 * Render redeploys.
 *
 * Sessions are simple in-memory tokens (no DB needed for a personal blog).
 * They reset if the server restarts, which just means re-entering the
 * password once - not a big deal for this use case.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const sessions = new Map(); // token -> expiry timestamp

let AUTH_PATH = '';
let pushChanges = async () => {};

function init(postsDir, commitAndPush) {
  AUTH_PATH = path.join(postsDir, 'auth.json');
  pushChanges = commitAndPush;
  if (!fs.existsSync(AUTH_PATH)) {
    fs.writeFileSync(AUTH_PATH, JSON.stringify({ passwordHash: null }, null, 2), 'utf8');
  }
}

function readAuth() {
  try {
    return JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
  } catch {
    return { passwordHash: null };
  }
}

function writeAuth(data) {
  fs.writeFileSync(AUTH_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

function isValidToken(token) {
  if (!token) return false;
  const expiry = sessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!isValidToken(token)) {
    return res.status(401).json({ error: 'auth required' });
  }
  next();
}

function status(req, res) {
  res.json({ hasPassword: Boolean(readAuth().passwordHash) });
}

async function setPassword(req, res) {
  const auth = readAuth();
  if (auth.passwordHash) {
    return res.status(400).json({ error: 'password already set' });
  }
  const { password } = req.body || {};
  if (!password || String(password).length < 4) {
    return res.status(400).json({ error: 'password too short' });
  }
  writeAuth({ passwordHash: bcrypt.hashSync(String(password), 10) });
  await pushChanges('auth: set password');
  res.json({ ok: true, token: createSession() });
}

async function verifyPassword(req, res) {
  const auth = readAuth();
  if (!auth.passwordHash) {
    return res.status(400).json({ error: 'no password set' });
  }
  const { password } = req.body || {};
  const ok = password && bcrypt.compareSync(String(password), auth.passwordHash);
  if (!ok) return res.status(401).json({ error: 'invalid password' });
  res.json({ ok: true, token: createSession() });
}

async function changePassword(req, res) {
  const auth = readAuth();
  const { currentPassword, newPassword } = req.body || {};
  if (auth.passwordHash) {
    const ok = currentPassword && bcrypt.compareSync(String(currentPassword), auth.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid current password' });
  }
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'password too short' });
  }
  writeAuth({ passwordHash: bcrypt.hashSync(String(newPassword), 10) });
  await pushChanges('auth: change password');
  res.json({ ok: true, token: createSession() });
}

module.exports = { init, requireAuth, status, setPassword, verifyPassword, changePassword };
