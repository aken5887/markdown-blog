const params = new URLSearchParams(location.search);
const editCategory = params.get('category');
const editFilename = params.get('filename');
const isEdit = Boolean(editCategory && editFilename);

const heading = document.getElementById('write-heading');
const titleInput = document.getElementById('title-input');
const categorySelect = document.getElementById('category-select');
const tagsInput = document.getElementById('tags-input');
const contentInput = document.getElementById('content-input');
const previewPane = document.getElementById('preview-pane');
const saveBtn = document.getElementById('save-btn');
const imageBtn = document.getElementById('image-upload-btn');
const imageInput = document.getElementById('image-input');
const dropzone = document.getElementById('md-dropzone');
const mdFileInput = document.getElementById('md-file-input');

if (isEdit) heading.textContent = '글 수정';

async function bootstrap() {
  const cfg = await getAppConfig();
  if (!cfg.writable) {
    location.replace('/');
    return;
  }
  await loadCategories();
  await loadExisting();
}

async function loadCategories() {
  const res = await fetch('/api/categories');
  const categories = await res.json();
  categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });
  if (editCategory) categorySelect.value = editCategory;
}

async function loadExisting() {
  if (!isEdit) return;
  const res = await fetch(`/api/posts/${encodeURIComponent(editCategory)}/${encodeURIComponent(editFilename)}`);
  if (!res.ok) return;
  const post = await res.json();
  titleInput.value = post.title;
  tagsInput.value = (post.tags || []).join(', ');
  contentInput.value = post.content;
  saveBtn.dataset.postId = post.id;
  renderPreview();
}

// ---- Live preview (input + preview shown side by side, always in sync) ----
function renderPreview() {
  previewPane.innerHTML = renderMarkdown(contentInput.value || '_내용이 없습니다._', {
    category: categorySelect.value,
  });
  previewPane.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
}
contentInput.addEventListener('input', renderPreview);
categorySelect.addEventListener('change', renderPreview);
renderPreview();

// Keep the two fixed-height panes at the same relative reading position.
// This remains useful when rendered images make the preview taller than source.
let syncingScroll = false;
function syncScroll(source, target) {
  if (syncingScroll) return;
  const sourceRange = source.scrollHeight - source.clientHeight;
  const targetRange = target.scrollHeight - target.clientHeight;
  if (sourceRange <= 0 || targetRange <= 0) return;

  syncingScroll = true;
  target.scrollTop = (source.scrollTop / sourceRange) * targetRange;
  requestAnimationFrame(() => { syncingScroll = false; });
}

contentInput.addEventListener('scroll', () => syncScroll(contentInput, previewPane));
previewPane.addEventListener('scroll', () => syncScroll(previewPane, contentInput));

// ---- Tab key inserts a literal tab character instead of moving focus ----
contentInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const start = contentInput.selectionStart;
  const end = contentInput.selectionEnd;
  contentInput.value = `${contentInput.value.slice(0, start)}\t${contentInput.value.slice(end)}`;
  contentInput.selectionStart = contentInput.selectionEnd = start + 1;
  renderPreview();
});

// ---- Inline image insert (file chooser and clipboard paste) ----
function insertAtCursor(text) {
  const start = contentInput.selectionStart;
  const end = contentInput.selectionEnd;
  contentInput.value = `${contentInput.value.slice(0, start)}${text}${contentInput.value.slice(end)}`;
  contentInput.selectionStart = contentInput.selectionEnd = start + text.length;
  contentInput.focus();
  renderPreview();
}

async function uploadAndInsertImage(file) {
  if (!file || !file.type.startsWith('image/')) return;
  try {
    await ensureAuth();
  } catch {
    return;
  }
  const formData = new FormData();
  formData.append('image', file);
  imageBtn.disabled = true;
  try {
    const res = await fetch('/api/images', { method: 'POST', headers: { ...authHeaders() }, body: formData });
    if (!res.ok) throw new Error('upload failed');
    const data = await res.json();
    // This relative path is also valid in Obsidian because both apps share posts/images.
    insertAtCursor(`![](${data.path})`);
  } catch (err) {
    alert('이미지 업로드에 실패했어요.');
  } finally {
    imageBtn.disabled = false;
  }
}

imageBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', async () => {
  const file = imageInput.files[0];
  await uploadAndInsertImage(file);
  imageInput.value = '';
});

contentInput.addEventListener('paste', async (event) => {
  const items = Array.from(event.clipboardData?.items || []);
  const images = items
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean);
  if (images.length === 0) return;

  // Do not insert an unusable data URL or text representation alongside the upload.
  event.preventDefault();
  for (const image of images) await uploadAndInsertImage(image);
});

// ---- MD file import (drag & drop, or "파일 선택") ----
async function importMdFile(file) {
  if (!file) return;
  let token;
  try {
    token = await ensureAuth();
  } catch {
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', categorySelect.value || '');
  dropzone.classList.add('dragover');
  try {
    const res = await fetch('/api/upload', { method: 'POST', headers: { ...authHeaders() }, body: formData });
    if (!res.ok) throw new Error('upload failed');
    const data = await res.json();
    location.href = `/posts/${data.id}`;
  } catch (err) {
    alert('MD 파일 업로드에 실패했어요.');
    dropzone.classList.remove('dragover');
  }
}

dropzone.addEventListener('click', () => mdFileInput.click());
mdFileInput.addEventListener('change', () => importMdFile(mdFileInput.files[0]));

['dragover', 'dragenter'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  importMdFile(e.dataTransfer.files[0]);
});

// ---- Save (password-protected) ----
saveBtn.addEventListener('click', async () => {
  const title = titleInput.value.trim();
  if (!title) {
    alert('제목을 입력해주세요.');
    return;
  }
  const category = categorySelect.value;
  if (!category) {
    alert('카테고리를 선택해주세요.');
    return;
  }

  let token;
  try {
    token = await ensureAuth();
  } catch {
    return;
  }

  const tags = tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean);
  const content = contentInput.value;

  saveBtn.disabled = true;
  saveBtn.textContent = '저장 중...';

  try {
    if (isEdit) {
      await fetch(`/api/posts/${encodeURIComponent(editCategory)}/${encodeURIComponent(editFilename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ content, newCategory: category, title, tags }),
      });
      location.href = `/posts/${saveBtn.dataset.postId}`;
    } else {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ category, title, content, tags }),
      });
      const data = await res.json();
      location.href = `/posts/${data.id}`;
    }
  } catch (err) {
    alert('저장에 실패했어요.');
    saveBtn.disabled = false;
    saveBtn.textContent = '저장';
  }
});

bootstrap();
