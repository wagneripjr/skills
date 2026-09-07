import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: false })

// Promoted docs open with OKF YAML frontmatter — marked renders it as <hr> garble.
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/

// Render markdown to an HTML string. 🟢/🔴 are wrapped as colored badges here (safe —
// these emoji only appear in text content of doc-this output, never in attributes).
export function renderMarkdown(text) {
  let html = marked.parse(text.replace(FRONTMATTER_RE, ''))
  html = html
    .replaceAll('🟢', '<span class="badge ok" title="confirmed">🟢</span>')
    .replaceAll('🔴', '<span class="badge gap" title="gap">🔴</span>')
  return html
}

// Collapse ./ and ../ segments in a POSIX-ish path.
function normalizePath(p) {
  const out = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/')
}

// Post-process the rendered DOM: rewrite relative image/link URLs against the DOC's
// directory (not the page URL), turn .md links into in-app hash routes, and wrap
// file:line citations as monospace chips.
export function postProcess(container, docPath) {
  const dir = docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/') + 1) : ''

  container.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || ''
    if (!/^(https?:|data:|\/)/.test(src)) img.setAttribute('src', '/' + normalizePath(dir + src))
    img.setAttribute('loading', 'lazy')
  })

  container.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') || ''
    if (/^(https?:|mailto:|#)/.test(href)) {
      if (/^https?:/.test(href)) {
        a.setAttribute('target', '_blank')
        a.setAttribute('rel', 'noopener')
      }
      return
    }
    if (href.endsWith('.md')) {
      a.setAttribute('href', '#' + normalizePath(dir + href))
    }
  })

  chipCitations(container)
}

// Wrap `path/to/file.ext:42` occurrences in text nodes as <code class="cite"> chips.
function chipCitations(container) {
  const re = /([\w./-]+\.[A-Za-z0-9]+:\d+)/g
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const targets = []
  let node
  while ((node = walker.nextNode())) {
    const parent = node.parentElement
    if (!parent) continue
    const tag = parent.tagName
    if (tag === 'CODE' || tag === 'PRE' || tag === 'A') continue
    if (re.test(node.nodeValue || '')) targets.push(node)
    re.lastIndex = 0
  }
  for (const textNode of targets) {
    const frag = document.createDocumentFragment()
    let last = 0
    const value = textNode.nodeValue || ''
    re.lastIndex = 0
    let m
    while ((m = re.exec(value))) {
      if (m.index > last) frag.appendChild(document.createTextNode(value.slice(last, m.index)))
      const chip = document.createElement('code')
      chip.className = 'cite'
      chip.textContent = m[1]
      frag.appendChild(chip)
      last = m.index + m[1].length
    }
    if (last < value.length) frag.appendChild(document.createTextNode(value.slice(last)))
    textNode.parentNode.replaceChild(frag, textNode)
  }
}
