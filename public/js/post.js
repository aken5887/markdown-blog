const id = location.pathname.split('/').filter(Boolean).pop();

async function loadPost() {
  const res = await fetch(`/api/posts/by-id/${encodeURIComponent(id)}`);
  if (!res.ok) {
    document.getElementById('post-content').textContent = '글을 찾을 수 없어요.';
    return;
  }
  const post = await res.json();

  document.title = `${post.title} · local-blog`;

  const categoryEl = document.getElementById('post-category');
  categoryEl.textContent = post.category;
  categoryEl.dataset.category = post.category;

  document.getElementById('post-title').textContent = post.title;
  document.getElementById('post-date').textContent = post.date;
  const tagsEl = document.getElementById('post-tags');
  (post.tags || []).forEach((t) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = t;
    tagsEl.appendChild(chip);
  });
  document.getElementById('post-content').innerHTML = marked.parse(post.content || '');
  hljs.highlightAll();

  const cfg = await getAppConfig();
  if (!cfg.writable) return;

  const actions = document.getElementById('post-actions');

  const editBtn = document.createElement('a');
  editBtn.className = 'btn-ghost';
  editBtn.textContent = '수정';
  editBtn.href = `/write.html?category=${encodeURIComponent(post.category)}&filename=${encodeURIComponent(post.filename)}`;
  actions.appendChild(editBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-danger';
  delBtn.textContent = '삭제';
  delBtn.addEventListener('click', async () => {
    if (!confirm('정말 삭제할까요? 되돌릴 수 없어요.')) return;
    let token;
    try {
      token = await ensureAuth();
    } catch {
      return;
    }
    await fetch(`/api/posts/${encodeURIComponent(post.category)}/${encodeURIComponent(post.filename)}`, {
      method: 'DELETE',
      headers: { ...authHeaders() },
    });
    location.href = '/';
  });
  actions.appendChild(delBtn);
}

loadPost();
