const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const matter = require('gray-matter');
const dataSync = require('./dataSync');
const auth = require('./auth');

const CATEGORIES = ['개발', '삽질', '공부'];
const PORT = process.env.PORT || 3000;

// Production (e.g. Render) is read-only in the UI and API by default.
// Set ALLOW_WRITES=true to override, or ALLOW_WRITES=false to force read-only locally.
function isWritable() {
  if (process.env.ALLOW_WRITES === 'true') return true;
  if (process.env.ALLOW_WRITES === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

function requireWritable(req, res, next) {
  if (!isWritable()) {
    return res.status(403).json({ error: 'read-only mode' });
  }
  next();
}

let POSTS_DIR;
let IMAGES_DIR;
let syncEnabled = false;
let pushChanges = async () => {};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// multer decodes multipart filenames as latin1 -> fix Korean (and other UTF-8) names
function decodeFilename(name) {
  return Buffer.from(name, 'latin1').toString('utf8');
}

function metaPath() {
  return path.join(POSTS_DIR, 'meta.json');
}

function readStoredMeta() {
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath(), 'utf8'));
    return Array.isArray(meta) ? meta : [];
  } catch {
    return [];
  }
}

function writeMeta(meta) {
  fs.writeFileSync(metaPath(), JSON.stringify(meta, null, 2), 'utf8');
}

function nextId(meta) {
  if (meta.length === 0) return 1;
  return Math.max(...meta.map((m) => m.id)) + 1;
}

const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);

function readMarkdownContents(directory) {
  if (!fs.existsSync(directory)) return '';
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((contents, entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return contents + readMarkdownContents(entryPath);
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) return contents;
    try {
      return `${contents}\n${fs.readFileSync(entryPath, 'utf8')}`;
    } catch {
      return contents;
    }
  }, '');
}

// Images are shared in posts/images. Keep a file when its literal or
// URL-encoded filename appears in any Markdown file, including Obsidian links.
function cleanupUnusedImages() {
  if (!fs.existsSync(IMAGES_DIR)) return [];
  const markdown = readMarkdownContents(POSTS_DIR);
  const deleted = [];

  for (const entry of fs.readdirSync(IMAGES_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const encodedName = encodeURIComponent(entry.name);
    if (markdown.includes(entry.name) || markdown.includes(encodedName)) continue;

    fs.unlinkSync(path.join(IMAGES_DIR, entry.name));
    deleted.push(entry.name);
  }

  if (deleted.length > 0) {
    console.log(`[images] removed ${deleted.length} unused image(s)`);
  }
  return deleted;
}

// Keep the metadata index in sync with Markdown files copied into category
// folders manually. Existing IDs are preserved; newly discovered files receive
// the next available ID, and metadata for removed files is discarded.
function readMeta() {
  const storedMeta = readStoredMeta();
  const meta = [];
  const knownFiles = new Set();
  let changed = false;

  for (const entry of storedMeta) {
    const key = `${entry.category}/${entry.filename}`;
    const filePath = path.join(POSTS_DIR, entry.category || '', entry.filename || '');
    if (
      !isValidCategory(entry.category) ||
      !isSafeFilename(entry.filename) ||
      knownFiles.has(key) ||
      !fs.existsSync(filePath)
    ) {
      changed = true;
      continue;
    }
    knownFiles.add(key);
    meta.push(entry);
  }

  let id = nextId(meta);
  for (const category of CATEGORIES) {
    const categoryDir = path.join(POSTS_DIR, category);
    if (!fs.existsSync(categoryDir)) continue;

    const filenames = fs
      .readdirSync(categoryDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isSafeFilename(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'ko'));

    for (const filename of filenames) {
      const key = `${category}/${filename}`;
      if (knownFiles.has(key)) continue;
      meta.push({ id, category, filename });
      knownFiles.add(key);
      id += 1;
      changed = true;
    }
  }

  if (changed) writeMeta(meta);
  return meta;
}

function slugify(title) {
  const cleaned = String(title || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return cleaned || 'untitled';
}

function uniqueFilename(categoryDir, base) {
  let filename = `${base}.md`;
  let n = 2;
  while (fs.existsSync(path.join(categoryDir, filename))) {
    filename = `${base}-${n}.md`;
    n += 1;
  }
  return filename;
}

// Excerpt generator for the post cards. It keeps readable prose only: Markdown
// syntax, embeds, URLs, and decorative special characters are removed before
// the client receives the summary.
function toPlainText(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[\[[^\]\n]+\]\]/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s*/gm, '')
    .replace(/[*_~`|\\\[\]{}()<>#]/g, ' ')
    .replace(/[!@^=+;:"',.?/]/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidCategory(category) {
  return CATEGORIES.includes(category);
}

function isSafeFilename(filename) {
  return (
    typeof filename === 'string' &&
    filename.toLowerCase().endsWith('.md') &&
    !filename.includes('..') &&
    !filename.includes('/') &&
    !filename.includes('\\')
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  // gray-matter may parse YAML dates into Date objects
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s.slice(0, 10);
}

function resolveDates(data, stat) {
  const fallback = stat ? stat.mtime.toISOString().slice(0, 10) : today();
  const created =
    normalizeDate(data.created) ||
    normalizeDate(data.date) ||
    fallback;
  const updated =
    normalizeDate(data.updated) ||
    created;
  return { created, updated };
}

function sortByIdDesc(entries) {
  return entries.sort((a, b) => Number(b.id) - Number(a.id));
}

function loadPost(category, filename) {
  const filePath = path.join(POSTS_DIR, category, filename);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);
  const stat = fs.statSync(filePath);
  const { created, updated } = resolveDates(data, stat);
  return {
    title: data.title || filename.replace(/\.md$/i, ''),
    created,
    updated,
    // backward-compatible alias used by older clients
    date: created,
    tags: Array.isArray(data.tags) ? data.tags : [],
    // Encode spaces in image URLs so CommonMark parsers (marked.js) treat them
    // as <img> elements rather than plain text.
    // ![](images/Pasted image xxx.png) -> ![](images/Pasted%20image%20xxx.png)
    content: content.replace(/(!\[[^\]]*\]\()([^)]+)(\))/g, (m, open, url, close) => {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return m; // absolute URL: leave as-is
      return open + url.replace(/ /g, '%20') + close;
    }),
  };
}

function buildListItem(entry) {
  const post = loadPost(entry.category, entry.filename);
  if (!post) return null;
  return {
    id: entry.id,
    category: entry.category,
    filename: entry.filename,
    title: post.title,
    created: post.created,
    updated: post.updated,
    date: post.created,
    tags: post.tags,
    excerpt: toPlainText(post.content).slice(0, 160),
  };
}

async function start() {
  const resolved = await dataSync.init();
  POSTS_DIR = resolved.postsDir;
  IMAGES_DIR = resolved.imagesDir;
  syncEnabled = resolved.syncEnabled;
  pushChanges = resolved.commitAndPush;

  // Safety net: make sure the expected structure exists either way
  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  CATEGORIES.forEach((c) => fs.mkdirSync(path.join(POSTS_DIR, c), { recursive: true }));
  if (!fs.existsSync(metaPath())) writeMeta([]);
  auth.init(POSTS_DIR, pushChanges);
  cleanupUnusedImages();

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/images', express.static(IMAGES_DIR));
  // Markdown files can reference category-local images (for example,
  // ![](chart.png) in posts/공부/article.md resolves to posts/공부/images/chart.png).
  app.use('/post-images', express.static(POSTS_DIR));
  // Unified image URL used by markdown.js: /posts/images/:filename
  app.use('/posts/images', express.static(IMAGES_DIR));

  // ---------------- API ----------------

  app.get('/api/config', (req, res) => {
    res.json({
      writable: isWritable(),
      syncEnabled,
      env: process.env.NODE_ENV || 'development',
    });
  });

  app.get('/api/categories', (req, res) => {
    res.json(CATEGORIES);
  });

  app.get('/api/auth/status', auth.status);
  app.post('/api/auth/set-password', requireWritable, auth.setPassword);
  app.post('/api/auth/verify', requireWritable, auth.verifyPassword);
  app.post('/api/auth/change-password', requireWritable, auth.changePassword);

  app.get('/api/posts', (req, res) => {
    const { category } = req.query;
    let meta = readMeta();
    if (category) meta = meta.filter((m) => m.category === category);
    sortByIdDesc(meta);
    res.json(meta.map(buildListItem).filter(Boolean));
  });

  app.get('/api/search', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return res.json([]);
    const meta = readMeta();
    const results = [];
    for (const entry of meta) {
      const post = loadPost(entry.category, entry.filename);
      if (!post) continue;
      const haystack = [post.title, post.content, ...(post.tags || [])].join(' ').toLowerCase();
      if (haystack.includes(q)) {
        results.push({
          id: entry.id,
          category: entry.category,
          filename: entry.filename,
          title: post.title,
          created: post.created,
          updated: post.updated,
          date: post.created,
          tags: post.tags,
          excerpt: toPlainText(post.content).slice(0, 160),
        });
      }
    }
    sortByIdDesc(results);
    res.json(results);
  });

  // NOTE: /api/posts/by-id/:id must be registered before
  // /api/posts/:category/:filename, or the latter swallows it.
  app.get('/api/posts/by-id/:id', (req, res) => {
    const id = Number(req.params.id);
    const entry = readMeta().find((m) => m.id === id);
    if (!entry) return res.status(404).json({ error: 'not found' });
    const post = loadPost(entry.category, entry.filename);
    if (!post) return res.status(404).json({ error: 'not found' });
    res.json({ id: entry.id, category: entry.category, filename: entry.filename, ...post });
  });

  app.get('/api/posts/:category/:filename', (req, res) => {
    const { category, filename } = req.params;
    if (!isValidCategory(category) || !isSafeFilename(filename)) {
      return res.status(400).json({ error: 'invalid category or filename' });
    }
    const post = loadPost(category, filename);
    if (!post) return res.status(404).json({ error: 'not found' });
    const entry = readMeta().find((m) => m.category === category && m.filename === filename);
    res.json({ id: entry ? entry.id : null, category, filename, ...post });
  });

  app.post('/api/posts', requireWritable, auth.requireAuth, async (req, res) => {
    const { category, title, content, tags } = req.body || {};
    if (!isValidCategory(category)) return res.status(400).json({ error: 'invalid category' });
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });

    const categoryDir = path.join(POSTS_DIR, category);
    fs.mkdirSync(categoryDir, { recursive: true });
    const filename = uniqueFilename(categoryDir, slugify(title));
    const created = today();
    const updated = created;
    const tagList = Array.isArray(tags)
      ? tags
      : String(tags || '').split(',').map((t) => t.trim()).filter(Boolean);
    const fileBody = matter.stringify(content || '', { title, created, updated, tags: tagList });
    fs.writeFileSync(path.join(categoryDir, filename), fileBody, 'utf8');

    const meta = readMeta();
    const indexedPost = meta.find((entry) => entry.category === category && entry.filename === filename);
    const id = indexedPost ? indexedPost.id : nextId(meta);
    if (!indexedPost) {
      meta.push({ id, category, filename });
      writeMeta(meta);
    }

    await pushChanges(`post: create ${category}/${filename}`);
    res.json({ id, category, filename });
  });

  app.put('/api/posts/:category/:filename', requireWritable, auth.requireAuth, async (req, res) => {
    const { category, filename } = req.params;
    if (!isValidCategory(category) || !isSafeFilename(filename)) {
      return res.status(400).json({ error: 'invalid category or filename' });
    }
    const { content, newCategory, title, tags } = req.body || {};
    const meta = readMeta();
    const entry = meta.find((m) => m.category === category && m.filename === filename);
    if (!entry) return res.status(404).json({ error: 'not found' });

    const existing = loadPost(category, filename);
    if (!existing) return res.status(404).json({ error: 'not found' });

    const targetCategory = newCategory && isValidCategory(newCategory) ? newCategory : category;
    const finalTitle = title !== undefined ? title : existing.title;
    const finalTags =
      tags !== undefined
        ? Array.isArray(tags)
          ? tags
          : String(tags).split(',').map((t) => t.trim()).filter(Boolean)
        : existing.tags;
    const finalContent = content !== undefined ? content : existing.content;
    const fileBody = matter.stringify(finalContent, {
      title: finalTitle,
      created: existing.created,
      updated: today(),
      tags: finalTags,
    });

    const oldPath = path.join(POSTS_DIR, category, filename);
    const newPath = path.join(POSTS_DIR, targetCategory, filename);

    if (targetCategory !== category) {
      fs.mkdirSync(path.join(POSTS_DIR, targetCategory), { recursive: true });
      fs.writeFileSync(newPath, fileBody, 'utf8');
      fs.unlinkSync(oldPath);
      entry.category = targetCategory;
    } else {
      fs.writeFileSync(oldPath, fileBody, 'utf8');
    }
    writeMeta(meta);

    await pushChanges(`post: update ${targetCategory}/${filename}`);
    res.json({ id: entry.id, category: targetCategory, filename });
  });

  app.delete('/api/posts/:category/:filename', requireWritable, auth.requireAuth, async (req, res) => {
    const { category, filename } = req.params;
    if (!isValidCategory(category) || !isSafeFilename(filename)) {
      return res.status(400).json({ error: 'invalid category or filename' });
    }
    const filePath = path.join(POSTS_DIR, category, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' });
    fs.unlinkSync(filePath);

    let meta = readMeta();
    meta = meta.filter((m) => !(m.category === category && m.filename === filename));
    writeMeta(meta);

    await pushChanges(`post: delete ${category}/${filename}`);
    res.json({ ok: true });
  });

  app.post('/api/upload', requireWritable, auth.requireAuth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const category = isValidCategory(req.body.category) ? req.body.category : CATEGORIES[0];
    const originalName = decodeFilename(req.file.originalname);
    const raw = req.file.buffer.toString('utf8');
    const { data, content } = matter(raw);

    const categoryDir = path.join(POSTS_DIR, category);
    fs.mkdirSync(categoryDir, { recursive: true });
    const base = originalName.replace(/\.md$/i, '');
    const filename = uniqueFilename(categoryDir, slugify(data.title || base));
    const created =
      normalizeDate(data.created) ||
      normalizeDate(data.date) ||
      today();
    const updated = normalizeDate(data.updated) || created;
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const fileBody = matter.stringify(content, {
      title: data.title || base,
      created,
      updated,
      tags,
    });
    fs.writeFileSync(path.join(categoryDir, filename), fileBody, 'utf8');

    const meta = readMeta();
    const indexedPost = meta.find((entry) => entry.category === category && entry.filename === filename);
    const id = indexedPost ? indexedPost.id : nextId(meta);
    if (!indexedPost) {
      meta.push({ id, category, filename });
      writeMeta(meta);
    }

    await pushChanges(`post: import ${category}/${filename}`);
    res.json({ id, category, filename });
  });

  app.post('/api/images', requireWritable, auth.requireAuth, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'image required' });
    if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'image files only' });
    }
    const originalName = decodeFilename(req.file.originalname);
    const ext = path.extname(originalName).toLowerCase() || '.png';
    const safeBase = slugify(path.basename(originalName, ext));
    const savedName = `${Date.now()}-${safeBase}${ext}`;
    // All images go into a single shared folder: posts/images/
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMAGES_DIR, savedName), req.file.buffer);

    await pushChanges(`image: upload images/${savedName}`);
    res.json({ path: `images/${savedName}` });
  });

  // ---------------- Pages ----------------

  // SPA-style article route: post.html reads the :id from the URL client-side
  app.get('/posts/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'post.html'));
  });

  app.listen(PORT, () => {
    console.log(
      `markdown-blog running on http://localhost:${PORT} (git sync: ${syncEnabled ? 'ON' : 'off'}, writable: ${isWritable() ? 'yes' : 'no'})`
    );
  });
}

start();
