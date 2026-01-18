/*
  viewmd.js - Render a Markdown file (read-only) with basic highlighting.

  Usage:
    viewmd <path>

  Notes:
    - Reads a file from the VFS and prints rendered HTML to the shell.
    - This is intentionally a small, safe renderer (escapes all user content).
    - Supports headings, lists, blockquotes, code fences, inline code/bold/italic, and links.
*/

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHref(href) {
  const raw = String(href || '').trim();
  if (!raw) return null;
  // allow safe-ish URLs
  if (/^(https?:\/\/|mailto:)/i.test(raw)) return raw;
  // allow in-page anchors
  if (raw.startsWith('#')) return raw;
  return null;
}

function renderInline(text) {
  // Escape first, then add formatting on the escaped text.
  // For inline code, we avoid other formatting inside.
  const src = String(text || '');
  const parts = [];
  let i = 0;

  while (i < src.length) {
    const tick = src.indexOf('`', i);
    if (tick === -1) {
      parts.push({ type: 'text', value: src.slice(i) });
      break;
    }

    // text before `
    if (tick > i) {
      parts.push({ type: 'text', value: src.slice(i, tick) });
    }

    const end = src.indexOf('`', tick + 1);
    if (end === -1) {
      parts.push({ type: 'text', value: src.slice(tick) });
      break;
    }

    parts.push({ type: 'code', value: src.slice(tick + 1, end) });
    i = end + 1;
  }

  const renderTextWithLinksAndEmphasis = (s) => {
    // links: [text](url)
    // bold: **text**
    // italic: *text*
    // done in this order on already-escaped chunks.
    let out = escapeHtml(s);

    // Links
    out = out.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, (m, label, href) => {
      const safeHref = sanitizeHref(href);
      const safeLabel = escapeHtml(label);
      if (!safeHref) return safeLabel;
      return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`;
    });

    // Bold (non-greedy)
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic (simple)
    out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

    return out;
  };

  return parts
    .map((p) => {
      if (p.type === 'code') {
        return `<code style="background: rgba(255,255,255,0.08); padding: 0 0.2em; border-radius: 3px;">${escapeHtml(p.value)}</code>`;
      }
      return renderTextWithLinksAndEmphasis(p.value);
    })
    .join('');
}

function highlightJs(code) {
  const s = String(code || '');
  const kw = new Set([
    'break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends',
    'false','finally','for','function','if','import','in','instanceof','let','new','null','return','super','switch',
    'this','throw','true','try','typeof','undefined','var','void','while','with','yield','async','await'
  ]);

  const span = (color, txt) => `<span style="color:${color}">${escapeHtml(txt)}</span>`;
  const normal = (txt) => escapeHtml(txt);

  let out = '';
  let i = 0;

  const isIdentStart = (c) => /[A-Za-z_$]/.test(c);
  const isIdent = (c) => /[A-Za-z0-9_$]/.test(c);

  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];

    // Line comment
    if (c === '/' && next === '/') {
      let j = i + 2;
      while (j < s.length && s[j] !== '\n') j++;
      out += span('#93a1a1', s.slice(i, j));
      i = j;
      continue;
    }

    // Block comment
    if (c === '/' && next === '*') {
      let j = i + 2;
      while (j < s.length && !(s[j] === '*' && s[j + 1] === '/')) j++;
      j = Math.min(s.length, j + 2);
      out += span('#93a1a1', s.slice(i, j));
      i = j;
      continue;
    }

    // Strings
    if (c === '\'' || c === '"' || c === '`') {
      const quote = c;
      let j = i + 1;
      while (j < s.length) {
        const ch = s[j];
        if (ch === '\\') {
          j += 2;
          continue;
        }
        if (ch === quote) {
          j += 1;
          break;
        }
        j += 1;
      }
      out += span('#2aa198', s.slice(i, j));
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9._xXa-fA-F]/.test(s[j])) j++;
      out += span('#d33682', s.slice(i, j));
      i = j;
      continue;
    }

    // Identifiers/keywords
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < s.length && isIdent(s[j])) j++;
      const word = s.slice(i, j);
      if (kw.has(word)) {
        out += span('#b58900', word);
      } else {
        out += normal(word);
      }
      i = j;
      continue;
    }

    out += normal(c);
    i += 1;
  }

  return out;
}

function renderCodeBlock(code, lang) {
  const language = String(lang || '').toLowerCase();
  let inner;
  if (language === 'js' || language === 'javascript') {
    inner = highlightJs(code);
  } else {
    inner = escapeHtml(code);
  }

  return (
    `<pre style="margin: 0.75em 0; padding: 0.75em; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; overflow-x: auto;">` +
    `<code>${inner}</code>` +
    `</pre>`
  );
}

function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');

  const html = [];
  let inCode = false;
  let codeLang = '';
  let codeLines = [];

  let listMode = null; // 'ul' | 'ol'
  const flushList = () => {
    if (!listMode) return;
    html.push(listMode === 'ul' ? '</ul>' : '</ol>');
    listMode = null;
  };

  const flushCode = () => {
    if (!inCode) return;
    html.push(renderCodeBlock(codeLines.join('\n'), codeLang));
    inCode = false;
    codeLang = '';
    codeLines = [];
  };

  let para = [];
  const flushPara = () => {
    const text = para.join(' ').trim();
    if (text) {
      html.push(`<p style="margin: 0.5em 0;">${renderInline(text)}</p>`);
    }
    para = [];
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];

    // fenced code
    const fence = raw.match(/^```\s*([A-Za-z0-9_-]+)?\s*$/);
    if (fence) {
      flushPara();
      flushList();
      if (inCode) {
        flushCode();
      } else {
        inCode = true;
        codeLang = fence[1] || '';
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(raw);
      continue;
    }

    const line = raw.replace(/\t/g, '    ');

    // blank line
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }

    // headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      const level = h[1].length;
      const tag = `h${level}`;
      const size = level === 1 ? '1.5em' : level === 2 ? '1.25em' : level === 3 ? '1.1em' : '1.0em';
      html.push(`<${tag} style="margin: 0.8em 0 0.35em 0; font-size: ${size};">${renderInline(h[2])}</${tag}>`);
      continue;
    }

    // horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushPara();
      flushList();
      html.push('<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.2); margin: 0.9em 0;" />');
      continue;
    }

    // blockquote
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      flushPara();
      flushList();
      html.push(
        `<blockquote style="margin: 0.75em 0; padding-left: 0.8em; border-left: 3px solid rgba(255,255,255,0.25); opacity: 0.95;">` +
        `${renderInline(bq[1])}` +
        `</blockquote>`
      );
      continue;
    }

    // unordered list
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (listMode !== 'ul') {
        flushList();
        listMode = 'ul';
        html.push('<ul style="margin: 0.5em 0 0.5em 1.25em; padding: 0;">');
      }
      html.push(`<li style="margin: 0.15em 0;">${renderInline(ul[1])}</li>`);
      continue;
    }

    // ordered list
    const ol = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (ol) {
      flushPara();
      if (listMode !== 'ol') {
        flushList();
        listMode = 'ol';
        html.push('<ol style="margin: 0.5em 0 0.5em 1.25em; padding: 0;">');
      }
      html.push(`<li style="margin: 0.15em 0;">${renderInline(ol[2])}</li>`);
      continue;
    }

    // otherwise: paragraph continuation
    para.push(line.trim());
  }

  flushPara();
  flushList();
  flushCode();

  return (
    `<div class="viewmd" style="line-height: 1.35;">` +
    html.join('') +
    `</div>`
  );
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getScrollPercent(el) {
  if (!el) return 0;
  const maxScroll = el.scrollHeight - el.clientHeight;
  if (maxScroll <= 0) return 100;
  return Math.round((el.scrollTop / maxScroll) * 100);
}

async function main(shell, command, args) {
  const path = args && args[0] ? args[0] : null;
  if (!path) {
    shell.print('viewmd: missing file operand');
    shell.print('Usage: viewmd <path-to-markdown-file>');
    shell.print('');
    return;
  }

  let content;
  try {
    content = vfs.readFile(path);
  } catch (err) {
    shell.print(`viewmd: ${String((err && err.message) || err)}`);
    shell.print('');
    return;
  }

  try {
    const html = renderMarkdown(content);
    shell.enterProgramMode();
    shell.enterFullscreenMode();

    const exitRaw = typeof shell.enterRawMode === 'function'
      ? shell.enterRawMode({ hideInput: true })
      : null;

    try {
      shell.clear();
      shell.print(`viewmd: ${path}`);
      shell.print('');

      shell.printHTML(
        `<div id="viewmd-screen" style="height: 82vh; overflow-y: auto; overflow-x: hidden; padding: 0.5em 0.8em;">` +
        html +
        `</div>`
      );

      const screenEl = (typeof document !== 'undefined')
        ? document.getElementById('viewmd-screen')
        : null;

      const showStatus = () => {
        const pct = getScrollPercent(screenEl);
        shell.setStatusLine(
          `<span style="opacity:0.85;">↑/↓ scroll</span>` +
          `<span style="opacity:0.85;"> | PgUp/PgDn</span>` +
          `<span style="opacity:0.85;"> | Home/End</span>` +
          `<span style="opacity:0.85;"> | Esc/q close</span>` +
          `<span style="float:right; opacity:0.85;">${pct}%</span>`
        );
      };

      const scrollBy = (deltaPx) => {
        if (!screenEl) return;
        const maxScroll = screenEl.scrollHeight - screenEl.clientHeight;
        if (maxScroll <= 0) return;
        screenEl.scrollTop = clamp(screenEl.scrollTop + deltaPx, 0, maxScroll);
      };

      const pageStep = () => {
        if (!screenEl) return 0;
        return Math.max(80, Math.floor(screenEl.clientHeight * 0.9));
      };

      showStatus();

      let running = true;
      while (running) {
        const keyEvent = await shell.readKey();
        if (!keyEvent) continue;

        if (keyEvent.code === 'Escape' || keyEvent.key === 'q') {
          running = false;
          continue;
        }

        if (keyEvent.code === 'ArrowDown') {
          scrollBy(40);
          showStatus();
          continue;
        }

        if (keyEvent.code === 'ArrowUp') {
          scrollBy(-40);
          showStatus();
          continue;
        }

        if (keyEvent.code === 'PageDown' || keyEvent.key === ' ') {
          scrollBy(pageStep());
          showStatus();
          continue;
        }

        if (keyEvent.code === 'PageUp') {
          scrollBy(-pageStep());
          showStatus();
          continue;
        }

        if (keyEvent.code === 'Home' || keyEvent.key === 'g') {
          if (screenEl) screenEl.scrollTop = 0;
          showStatus();
          continue;
        }

        if (keyEvent.code === 'End' || keyEvent.key === 'G') {
          if (screenEl) screenEl.scrollTop = screenEl.scrollHeight;
          showStatus();
          continue;
        }
      }
    } finally {
      if (typeof exitRaw === 'function') {
        exitRaw();
      }
      shell.clearStatusLine();
      shell.exitFullscreenMode();
      shell.exitProgramMode();
    }
  } catch (err) {
    shell.print(`viewmd: failed to render markdown: ${String((err && err.message) || err)}`);
  }
}
