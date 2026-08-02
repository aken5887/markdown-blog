/**
 * dataSync.js
 *
 * Local mode (default): posts/ and public/images/ are used as-is, exactly like
 * the original local-only version. Nothing changes for local `node server.js` use.
 *
 * Cloud mode (when DATA_REPO_URL is set, e.g. on Render): posts/ and images/ are
 * cloned from a separate GitHub "data repo" on boot, and every write (create /
 * update / delete post, image upload) is committed and pushed back to that repo.
 * This is what survives Render's ephemeral filesystem across redeploys/restarts.
 */
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');

const DATA_REPO_URL = process.env.DATA_REPO_URL || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const DATA_DIR = path.join(__dirname, 'data-repo');

function authedUrl(url) {
  if (!GITHUB_TOKEN) return url;
  return url.replace('https://', `https://${GITHUB_TOKEN}@`);
}

let git = null;
let syncEnabled = false;

async function noopPush() {}

async function init() {
  if (!DATA_REPO_URL) {
    console.log('[dataSync] DATA_REPO_URL not set -> local storage mode (posts/, public/images/)');
    return {
      postsDir: path.join(__dirname, 'posts'),
      imagesDir: path.join(__dirname, 'public', 'images'),
      syncEnabled: false,
      commitAndPush: noopPush,
    };
  }

  const remote = authedUrl(DATA_REPO_URL);
  const postsDir = path.join(DATA_DIR, 'posts');
  const imagesDir = path.join(DATA_DIR, 'images');

  try {
    if (!fs.existsSync(path.join(DATA_DIR, '.git'))) {
      console.log('[dataSync] cloning data repo...');
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
      await simpleGit().clone(remote, DATA_DIR);
    } else {
      console.log('[dataSync] pulling latest data...');
      await simpleGit(DATA_DIR).pull();
    }
  } catch (err) {
    console.error('[dataSync] failed to sync data repo:', err.message);
    console.error('[dataSync] falling back to local storage for this run.');
    return {
      postsDir: path.join(__dirname, 'posts'),
      imagesDir: path.join(__dirname, 'public', 'images'),
      syncEnabled: false,
      commitAndPush: noopPush,
    };
  }

  fs.mkdirSync(postsDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });
  if (!fs.existsSync(path.join(postsDir, 'meta.json'))) {
    fs.writeFileSync(path.join(postsDir, 'meta.json'), '[]', 'utf8');
  }

  git = simpleGit(DATA_DIR);
  await git.addConfig('user.email', 'bot@markdown-blog.local');
  await git.addConfig('user.name', 'markdown-blog-bot');
  syncEnabled = true;

  return {
    postsDir,
    imagesDir,
    syncEnabled: true,
    commitAndPush,
  };
}

async function commitAndPush(message) {
  if (!syncEnabled || !git) return;
  try {
    await git.add('.');
    const status = await git.status();
    if (status.files.length === 0) return;
    await git.commit(message);
    await git.push();
    console.log('[dataSync] pushed:', message);
  } catch (err) {
    console.error('[dataSync] commit/push failed:', err.message);
  }
}

module.exports = { init };
