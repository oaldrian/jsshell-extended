/*! pathUtils.js | Small helpers for JsShell virtual filesystem paths */

/**
 * Normalize a path against a given cwdParts array, returning path parts
 * relative to the filesystem root. Mirrors the logic used by the
 * VirtualFileSystem for resolving paths (handling '.', '..', and
 * absolute vs relative paths).
 *
 * @param {string[]} cwdParts - current working directory parts relative to root
 * @param {string} path - path string to normalize (absolute or relative)
 * @returns {string[]} normalized path parts relative to root
 */
export function normalizePathParts(cwdParts, path) {
  const base = Array.isArray(cwdParts) ? [...cwdParts] : [];

  if (!path || path === '.') {
    return base;
  }

  const isAbsolute = path.startsWith('/');
  const rawParts = path.split('/').filter((p) => p && p !== '.');
  const result = isAbsolute ? [] : base;

  for (const part of rawParts) {
    if (part === '..') {
      if (result.length > 0) {
        result.pop();
      }
    } else {
      result.push(part);
    }
  }

  return result;
}

/**
 * Normalize a path string using a cwd path like "/foo/bar" and return
 * a canonical absolute path string (always starting with "/").
 *
 * @param {string} cwdPath - current working directory as path string
 * @param {string} path - path string to normalize
 * @returns {string} canonical absolute path string
 */
export function normalizePathFromCwd(cwdPath, path) {
  const cwdParts = !cwdPath || cwdPath === '/'
    ? []
    : cwdPath.split('/').filter((p) => p);
  const parts = normalizePathParts(cwdParts, path);
  return '/' + parts.join('/');
}

/**
 * Join a base absolute path with a segment, returning a canonical
 * absolute path string. If segment is absolute, it is normalized
 * on its own.
 *
 * @param {string} basePath - absolute base path (e.g. "/foo/bar")
 * @param {string} segment - relative or absolute path segment
 * @returns {string} canonical absolute path
 */
export function joinPath(basePath, segment) {
  if (!segment || segment === '.') {
    return normalizePathFromCwd(basePath, '.');
  }

  if (segment.startsWith('/')) {
    return normalizePathFromCwd('/', segment);
  }

  const combined = (basePath && basePath !== '/' ? basePath.replace(/\/+$/, '') : '') + '/' + segment;
  return normalizePathFromCwd('/', combined);
}
