/*! print.js | `print` command: open browser print dialog for a VFS text file */

import { vfs } from '../fs/virtualFileSystem.js';

export const printCommands = ['print'];

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Execute the `print` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 */
export function executePrintProgram(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'print') {
    return { handled: false, shouldContinue: true };
  }

  if (!Array.isArray(args) || args.length < 1) {
    shell.print('print: missing operand');
    shell.print("Try 'print filename.txt'");
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('print: missing operand') };
  }

  const path = args[0];
  let content = '';
  try {
    content = vfs.readFile(path);
  } catch (err) {
    shell.print(`print: cannot read '${path}': ${err.message || err}`);
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('print: cannot read file') };
  }

  try {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      throw new Error('window.open is not available');
    }

    const w = window.open('', '_blank');
    if (!w) {
      throw new Error('Popup blocked');
    }

    const title = escapeHtml(path);
    const body = escapeHtml(content);

    w.document.open();
    w.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; padding: 24px; }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 12pt; }
  </style>
</head>
<body>
  <h2>${title}</h2>
  <pre>${body}</pre>
</body>
</html>`);
    w.document.close();

    // Try to print after the new window finishes layout.
    w.focus();
    w.onafterprint = () => {
      try { w.close(); } catch (_) { /* ignore */ }
    };
    setTimeout(() => {
      try { w.print(); } catch (_) { /* ignore */ }
    }, 50);

    return { handled: true, shouldContinue: true, ok: true };
  } catch (err) {
    shell.print(`print: ${err.message || err}`);
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: new Error('print: failed') };
  }
}
