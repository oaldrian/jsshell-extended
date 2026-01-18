/*! help.js | `help` command for JsShell */

import { vfs } from '../fs/virtualFileSystem.js';
import { executeVfsScript } from './runScript.js';

// Command names provided by this module
export const helpCommands = ['help'];

const HELP_DIR = '/etc/help';
const GENERAL_HELP = '/etc/help/help.md';

function normalizeTopicName(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  // Allow "./foo" or "/bin/foo" inputs and normalize to a bare command token.
  const stripped = raw.replace(/^\.\//, '').replace(/^\/+/, '');
  const parts = stripped.split('/').filter(Boolean);
  const base = parts.length ? parts[parts.length - 1] : stripped;
  return base.replace(/\.js$/i, '').toLowerCase();
}

function topicPath(topic) {
  const name = normalizeTopicName(topic);
  if (!name) return null;
  return `${HELP_DIR}/${name}.md`;
}

async function renderMarkdownFile(shell, vfsPath) {
  // Prefer rendering through the VFS-installed viewmd program so we get
  // consistent Markdown highlighting.
  try {
    const viewmdPath = '/bin/viewmd.js';
    vfs.readFile(viewmdPath);
    const res = await executeVfsScript(shell, viewmdPath, [vfsPath], 'viewmd');
    return res && res.ok !== false;
  } catch (_) {
    // Fallback: print raw content
  }

  try {
    const content = vfs.readFile(vfsPath);
    shell.print(String(content || ''));
    shell.print('');
    return true;
  } catch (err) {
    shell.print(`help: ${String((err && err.message) || err)}`);
    shell.print('');
    return false;
  }
}

function listTopics() {
  try {
    const listing = vfs.list(HELP_DIR);
    const files = listing && Array.isArray(listing.files) ? listing.files : [];
    return files
      .filter((f) => typeof f === 'string' && f.toLowerCase().endsWith('.md'))
      .map((f) => f.slice(0, -3))
      .sort((a, b) => a.localeCompare(b));
  } catch (_) {
    return [];
  }
}

/**
 * Execute the `help` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 * @returns {{ handled: boolean, shouldContinue: boolean } | undefined}
 */
export async function executeHelpCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'help') {
    return { handled: false, shouldContinue: true };
  }

  const topic = args && args[0] ? args[0] : '';
  if (!topic) {
    // General help
    const ok = await renderMarkdownFile(shell, GENERAL_HELP);
    if (!ok) {
      shell.print('help: no help files installed yet.');
      shell.print('Try running: init');
      shell.print('');
    }
    return { handled: true, shouldContinue: true };
  }

  const path = topicPath(topic);
  if (!path) {
    await renderMarkdownFile(shell, GENERAL_HELP);
    return { handled: true, shouldContinue: true };
  }

  // Topic help
  try {
    vfs.readFile(path);
    await renderMarkdownFile(shell, path);
    return { handled: true, shouldContinue: true };
  } catch (_) {
    shell.print(`help: no help topic found for "${normalizeTopicName(topic)}".`);
    const topics = listTopics();
    if (topics.length) {
      shell.print('Available help topics:');
      shell.print('  ' + topics.join(', '));
    } else {
      shell.print(`No help topics installed. Try running: init`);
    }
    shell.print('');
    return { handled: true, shouldContinue: true };
  }
}
