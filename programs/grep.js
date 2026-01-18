/*! grep.js | `grep` command for JsShell virtual filesystem */

import { vfs } from '../fs/virtualFileSystem.js';
import { joinPath, normalizePathFromCwd } from '../fs/pathUtils.js';

export const grepCommands = ['grep'];

function parseGrepArgs(args) {
  const opts = {
    recursive: false,
    ignoreCase: false,
    lineNumbers: false
  };

  const rest = [];
  let parsingFlags = true;

  for (const raw of args) {
    const a = String(raw ?? '');
    if (parsingFlags && a === '--') {
      parsingFlags = false;
      continue;
    }

    if (parsingFlags && a.startsWith('-') && a.length > 1) {
      if (a === '-r') {
        opts.recursive = true;
        continue;
      }

      // allow combined flags like -rin
      for (const ch of a.slice(1)) {
        if (ch === 'r') opts.recursive = true;
        else if (ch === 'i') opts.ignoreCase = true;
        else if (ch === 'n') opts.lineNumbers = true;
        else return { error: `grep: unknown option: -${ch}`, opts, rest };
      }
      continue;
    }

    rest.push(a);
  }

  if (rest.length === 0) {
    return { error: 'grep: missing search pattern', opts, pattern: null, paths: [] };
  }

  const patternToken = rest[0];
  const paths = rest.slice(1);

  return { error: null, opts, pattern: patternToken, paths };
}

function compileMatcher(patternToken, ignoreCase) {
  const token = String(patternToken ?? '');

  // Regex shorthand: /.../ (no flags parsing)
  if (token.length >= 2 && token.startsWith('/') && token.endsWith('/')) {
    const body = token.slice(1, -1);
    const flags = ignoreCase ? 'i' : '';
    const re = new RegExp(body, flags);
    return {
      test: (line) => re.test(String(line ?? '')),
      describe: () => token
    };
  }

  const needle = ignoreCase ? token.toLowerCase() : token;
  return {
    test: (line) => {
      const hay = ignoreCase ? String(line ?? '').toLowerCase() : String(line ?? '');
      return hay.includes(needle);
    },
    describe: () => token
  };
}

function *walkFilesRecursive(startPath) {
  const stack = [startPath];
  while (stack.length) {
    const current = stack.pop();
    let listing;
    try {
      listing = vfs.list(current);
    } catch (_) {
      // not a folder, treat as file
      yield current;
      continue;
    }

    const folders = Array.isArray(listing.folders) ? listing.folders.slice().sort((a, b) => String(a).localeCompare(String(b))) : [];
    const files = Array.isArray(listing.files) ? listing.files.slice().sort((a, b) => String(a).localeCompare(String(b))) : [];

    for (let i = files.length - 1; i >= 0; i -= 1) {
      yield joinPath(current, files[i]);
    }

    for (let i = folders.length - 1; i >= 0; i -= 1) {
      stack.push(joinPath(current, folders[i]));
    }
  }
}

function grepFile({ shell, path, matcher, opts, showFilePrefix }) {
  let content;
  try {
    content = vfs.readFile(path);
  } catch (_) {
    return { matched: false, failed: true };
  }

  const lines = String(content ?? '').replace(/\r\n/g, '\n').split('\n');
  let matched = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!matcher.test(line)) continue;
    matched = true;

    const lineNo = i + 1;
    const prefixParts = [];
    if (showFilePrefix) prefixParts.push(path);
    if (opts.lineNumbers) prefixParts.push(String(lineNo));
    const prefix = prefixParts.length ? prefixParts.join(':') + ':' : '';

    shell.print(prefix + line);
  }

  return { matched, failed: false };
}

/**
 * Execute the `grep` command.
 * @param {import('../jsShell.js').JsShell} shell
 * @param {string} command
 * @param {string[]} args
 */
export function executeGrepCommand(shell, command, args) {
  const normalized = (command || '').toLowerCase();
  if (normalized !== 'grep') {
    return { handled: false, shouldContinue: true };
  }

  const parsed = parseGrepArgs(Array.isArray(args) ? args : []);
  if (parsed.error) {
    shell.print(parsed.error);
    shell.print('Usage: grep [-r] [-i] [-n] <pattern> [path ...]');
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false };
  }

  let matcher;
  try {
    matcher = compileMatcher(parsed.pattern, parsed.opts.ignoreCase);
  } catch (e) {
    shell.print(`grep: invalid pattern: ${String((e && e.message) || e)}`);
    shell.print('');
    return { handled: true, shouldContinue: true, ok: false, error: e };
  }

  const cwdPath = typeof vfs.getCwdPath === 'function' ? vfs.getCwdPath() : '/';

  let paths = parsed.paths.slice();
  if (paths.length === 0) {
    if (parsed.opts.recursive) {
      paths = ['.'];
    } else {
      shell.print('grep: missing file operand');
      shell.print('Usage: grep [-r] [-i] [-n] <pattern> [path ...]');
      shell.print('');
      return { handled: true, shouldContinue: true, ok: false };
    }
  }

  const absoluteInputs = paths.map((p) => normalizePathFromCwd(cwdPath, p));

  // Expand paths to file list
  const fileList = [];
  if (parsed.opts.recursive) {
    for (const p of absoluteInputs) {
      for (const f of walkFilesRecursive(p)) {
        // only include actual files (skip folders yielded due to list failures)
        try {
          vfs.readFile(f);
          fileList.push(f);
        } catch (_) {
          // ignore
        }
      }
    }
  } else {
    for (const p of absoluteInputs) {
      fileList.push(p);
    }
  }

  const showFilePrefix = parsed.opts.recursive || fileList.length > 1;

  let anyMatch = false;
  let anyFailed = false;

  for (const filePath of fileList) {
    const res = grepFile({
      shell,
      path: filePath,
      matcher,
      opts: parsed.opts,
      showFilePrefix
    });
    if (res.failed) anyFailed = true;
    if (res.matched) anyMatch = true;
  }

  if (anyFailed && !anyMatch) {
    // Keep output quiet like grep; still report success/failure via ok flag
  }

  shell.print('');
  return { handled: true, shouldContinue: true, ok: anyMatch && !anyFailed };
}
