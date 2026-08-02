// marked occasionally leaves valid **strong text** tokens as plain text when
// they appear in certain list or paragraph combinations. Normalize those text
// nodes after rendering, without touching literal Markdown in code blocks.
function renderMarkdown(markdown) {
  const container = document.createElement('div');
  container.innerHTML = marked.parse(markdown || '');

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

  return container.innerHTML;
}
