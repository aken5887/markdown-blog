const grid = document.getElementById("post-grid");
const tabsEl = document.getElementById("category-tabs");
const template = document.getElementById("card-template");

let currentCategory = "";

function setActiveTab(cat) {
  [...tabsEl.children].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.category === cat);
  });
}

function selectCategory(cat) {
  currentCategory = cat;
  setActiveTab(cat);
  loadPosts();
}

async function loadCategories() {
  const res = await fetch("/api/categories");
  const categories = await res.json();
  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "tab";
    btn.dataset.category = cat;
    btn.textContent = cat;
    btn.addEventListener("click", () => selectCategory(cat));
    tabsEl.appendChild(btn);
  });
}

async function loadPosts() {
  const url = currentCategory
    ? `/api/posts?category=${encodeURIComponent(currentCategory)}`
    : "/api/posts";
  const res = await fetch(url);
  renderPosts(await res.json());
}

function formatDates(created, updated) {
  const c = created || "";
  const u = updated || created || "";
  if (u && u !== c) return { created: c, updated: u, same: false };
  return { created: c, updated: c, same: true };
}

function renderPosts(posts) {
  grid.innerHTML = "";
  if (posts.length === 0) {
    grid.innerHTML =
      '<p class="empty-state">아직 글이 없어요. 첫 글을 남겨보세요.</p>';
    return;
  }
  posts.forEach((post) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".post-card");
    card.href = `/posts/${post.id}`;
    const badge = card.querySelector(".category-badge");
    badge.textContent = post.category;
    badge.dataset.category = post.category;
    card.querySelector(".card-title").textContent = post.title;
    card.querySelector(".card-excerpt").textContent = post.excerpt;
    const dates = formatDates(post.created || post.date, post.updated);
    const createdEl = card.querySelector(".card-created");
    createdEl.textContent = dates.created;
    createdEl.dateTime = dates.created;
    const tagsEl = card.querySelector(".card-tags");
    (post.tags || []).forEach((t) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = t;
      tagsEl.appendChild(chip);
    });
    // 태그가 없을 때는 날짜 앞 구분자를 표시하지 않는다.
    card.querySelector(".card-meta-separator").hidden = !(post.tags || []).length;
    grid.appendChild(node);
  });
}

document
  .querySelector('.tab[data-category=""]')
  .addEventListener("click", () => selectCategory(""));

getAppConfig().then((cfg) => {
  if (cfg.writable) {
    const writeBtn = document.getElementById("write-btn");
    if (writeBtn) writeBtn.hidden = false;
  }
});

loadCategories();
loadPosts();

// ---- Search popup ----
const searchToggle = document.getElementById("search-toggle");
const searchOverlay = document.getElementById("search-overlay");
const searchClose = document.getElementById("search-close");
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
let searchTimer = null;

function openSearch() {
  searchOverlay.hidden = false;
  searchInput.value = "";
  searchResults.innerHTML = "";
  searchInput.focus();
}

function closeSearch() {
  searchOverlay.hidden = true;
}

searchToggle.addEventListener("click", () => {
  if (searchOverlay.hidden) openSearch();
  else closeSearch();
});
searchClose.addEventListener("click", closeSearch);
searchOverlay.addEventListener("click", (e) => {
  if (e.target === searchOverlay) closeSearch();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !searchOverlay.hidden) closeSearch();
});

searchInput.addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  searchTimer = setTimeout(() => runSearch(q), 250);
});

async function runSearch(q) {
  if (!q) {
    searchResults.innerHTML = "";
    return;
  }
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  renderSearchResults(await res.json());
}

function renderSearchResults(posts) {
  searchResults.innerHTML = "";
  if (posts.length === 0) {
    searchResults.innerHTML = '<p class="search-empty">검색 결과가 없어요.</p>';
    return;
  }
  posts.forEach((post) => {
    const item = document.createElement("a");
    item.className = "search-result-item";
    item.href = `/posts/${post.id}`;
    item.innerHTML = `
      <div class="search-result-title">${post.title}</div>
      <div class="search-result-meta">${post.category} | 등록일 ${post.created || post.date}${
        post.updated && post.updated !== (post.created || post.date)
          ? ` | 수정일 ${post.updated}`
          : ""
      }</div>`;
    searchResults.appendChild(item);
  });
}

// ---- Theme toggle ----
const themeToggle = document.getElementById("theme-toggle");

function applyTheme(theme) {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  localStorage.setItem("devlog-theme", theme);
}

themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.dataset.theme === "dark";
  applyTheme(isDark ? "light" : "dark");
});
