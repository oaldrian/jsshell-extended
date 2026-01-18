/*! backup.js | Backup browser localStorage to a downloadable file */

const BACKUP_FILENAME_PREFIX = 'jsshell-backup-';

export const backupCommands = ['backup'];

function createDownload(content, filename) {
  try {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * backup [storageKey] [filename]
 *
 * - With no arguments: backs up all keys from window.localStorage.
 * - With storageKey: backs up only that key (if present).
 * - Optional filename overrides the default.
 */
export async function executeBackupProgram(shell, command, args) {
  if (command !== 'backup') {
    return { handled: false, shouldContinue: true };
  }

  if (typeof window === 'undefined' || !window.localStorage) {
    shell.print('backup: window.localStorage is not available in this environment.');
    shell.print('');
    return { handled: true, shouldContinue: true };
  }

  const storage = window.localStorage;
  let keysToBackup = [];

  if (args.length > 0 && args[0]) {
    const key = args[0];
    if (storage.getItem(key) === null) {
      shell.print(`backup: key "${key}" not found in localStorage.`);
      shell.print('');
      return { handled: true, shouldContinue: true };
    }
    keysToBackup = [key];
  } else {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k != null) {
        keysToBackup.push(k);
      }
    }
  }

  const backup = {
    createdAt: new Date().toISOString(),
    origin: typeof window !== 'undefined' ? window.location.origin : undefined,
    keys: {}
  };

  for (const key of keysToBackup) {
    backup.keys[key] = storage.getItem(key);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultName = `${BACKUP_FILENAME_PREFIX}${timestamp}.zip`;
  const filename = args.length > 1 && args[1] ? args[1] : defaultName;

  const ok = createDownload(JSON.stringify(backup, null, 2), filename);

  if (!ok) {
    shell.print('backup: failed to trigger download (browser restriction or error).');
  } else {
    shell.print(`backup: created backup for ${keysToBackup.length} localStorage key(s) as ${filename}.`);
  }
  shell.print('');

  return { handled: true, shouldContinue: true };
}
