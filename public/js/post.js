const id = location.pathname.split('/').filter(Boolean).pop();

async function loadPost() {
  const res = await fetch(`/api/posts/by-id/${encodeURIComponent(id)}`);
  if (!res.ok) {
    document.getElementById('post-content').textContent = '글을 찾을 수 없어요.';
    return;
  }
  const post = await res.json();

  document.title = `${post.title} · markdown-blog`;

  const categoryEl = document.getElementById('post-category');
  categoryEl.textContent = post.category;
  categoryEl.dataset.category = post.category;

  document.getElementById('post-title').textContent = post.title;

  const created = post.created || post.date || '';
  const updated = post.updated || created;
  const datesEl = document.getElementById('post-dates');
  datesEl.innerHTML = '';

  const createdTime = document.createElement('time');
  createdTime.className = 'card-date';
  createdTime.dateTime = created;
  createdTime.textContent = `등록일 ${created}`;
  datesEl.appendChild(createdTime);

  const updatedTime = document.createElement('time');
  updatedTime.className = 'card-date';
  updatedTime.dateTime = updated;
  updatedTime.textContent = `수정일 ${updated}`;
  datesEl.appendChild(updatedTime);

  const tagsEl = document.getElementById('post-tags');
  (post.tags || []).forEach((t) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = t;
    tagsEl.appendChild(chip);
  });
  document.getElementById('post-content').innerHTML = renderMarkdown(post.content || '');
  hljs.highlightAll();

  const cfg = await getAppConfig();
  if (!cfg.writable) return;

  const actions = document.getElementById('post-actions');
  actions.hidden = false;

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
    try {
      await ensureAuth();
      const deletePost = () =>
        fetch(`/api/posts/${encodeURIComponent(post.category)}/${encodeURIComponent(post.filename)}`, {
          method: 'DELETE',
          headers: { ...authHeaders() },
        });

      let res = await deletePost();
      // Sessions are server-memory only, so a server restart invalidates the
      // browser's still-unexpired token. Ask once more and retry the request.
      if (res.status === 401) {
        clearAuthToken();
        await ensureAuth();
        res = await deletePost();
      }
      if (!res.ok) throw new Error('delete failed');
      location.href = '/';
    } catch {
      alert('삭제에 실패했어요. 비밀번호를 다시 확인한 뒤 시도해주세요.');
    }
  });
  actions.appendChild(delBtn);
}

loadPost();
