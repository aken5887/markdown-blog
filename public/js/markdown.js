// marked occasionally leaves valid **strong text** tokens as plain text when
// they appear in certain list or paragraph combinations. Normalize those text
// nodes after rendering, without touching literal Markdown in code blocks.
//
// Also normalizes Obsidian wiki-style image embeds and rewrites relative image
// paths to the unified /posts/images/ directory.
function renderMarkdown(markdown, { category } = {}) {
  // Obsidian: ![[filename.png]], ![[images/filename.png]], and
  // ![[filename.png|400]] → standard Markdown image. The display-size suffix
  // is intentionally ignored: responsive CSS controls image width on the blog.
  const normalized = String(markdown || '').replace(
    /!\[\[([^\]\n]+)\]\]/g,
    (_, target) => {
      const src = String(target).split('|', 1)[0].trim();
      if (!src) return '';
      // Only treat as image when it looks like one (has image extension or lives under images/)
      if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(src) || /(^|\/)images\//i.test(src)) {
        // Marked requires spaces in a Markdown URL to be percent-encoded.
        let encoded = src;
        try { encoded = encodeURI(decodeURI(src)); } catch { encoded = encodeURI(src); }
        return `![](${encoded})`;
      }
      // Non-image wiki link: leave a plain text fallback
      return src;
    }
  );

  const container = document.createElement('div');
  container.innerHTML = marked.parse(normalized);

  const textNodes = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (
      /\*\*[^*\n]+?\*\*/.test(node.nodeValue) &&
      !node.parentElement.closest('pre, code')
    ) {
      textNodes.push(node);
    }
  }

  textNodes.forEach((node) => {
    const fragment = document.createDocumentFragment();
    const source = node.nodeValue;
    let lastIndex = 0;

    source.replace(/\*\*([^*\n]+?)\*\*/g, (match, content, offset) => {
      fragment.append(document.createTextNode(source.slice(lastIndex, offset)));
      const strong = document.createElement('strong');
      strong.textContent = content;
      fragment.append(strong);
      lastIndex = offset + match.length;
      return match;
    });
    fragment.append(document.createTextNode(source.slice(lastIndex)));
    node.replaceWith(fragment);
  });

  // Rewrite relative (and known local) image paths to /posts/images/<filename>.
  // External absolute URLs (http/https/data/...) are left unchanged.
  const imagePrefix = '/posts/images/';
  container.querySelectorAll('img').forEach((image) => {
    const source = (image.getAttribute('src') || '').trim();
    if (!source) return;

    // Already pointing at the unified path
    if (source.startsWith(imagePrefix)) {
      // Re-encode filename segment in case of spaces
      const name = decodeURIComponent(source.slice(imagePrefix.length).split(/[?#]/)[0]);
      if (name && !name.includes('..') && !name.includes('/')) {
        image.setAttribute('src', `${imagePrefix}${encodeURIComponent(name)}`);
      }
      return;
    }

    // External / protocol-relative / hash — leave alone
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(source)) return;

    // Strip optional leading "./", "images/", "/images/", "/posts/images/"
    let filename = source
      .replace(/^\.\//, '')
      .replace(/^\/?posts\/images\//i, '')
      .replace(/^\/?images\//i, '');

    // The server and wiki-link normalization may already have encoded spaces.
    // Decode before encoding the final URL so "%20" never becomes "%2520".
    try { filename = decodeURIComponent(filename); } catch { /* keep malformed input unchanged */ }

    // Reject path traversal or nested paths after stripping
    if (!filename || filename.includes('/') || filename.includes('..') || filename.includes('\\')) {
      return;
    }

    image.setAttribute('src', `${imagePrefix}${encodeURIComponent(filename)}`);
  });

  return container.innerHTML;
}
