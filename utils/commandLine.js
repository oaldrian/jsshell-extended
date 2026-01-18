/* commandLine.js | Command line tokenization with quote support */

function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/**
 * Tokenize a command line into shell-like arguments.
 * - Whitespace separates tokens (outside quotes)
 * - Supports single quotes '...' and double quotes "..."
 * - Supports backslash escapes (\\) to include the next character literally
 *
 * Returns tokens with both parsed value and raw span indices.
 */
export function tokenizeCommandLine(input) {
  const src = String(input ?? '');
  const tokens = [];

  let i = 0;
  let buf = '';
  let tokenStart = null;
  let quote = null; // ' or "
  let quoteChar = null; // which quote started this token (if any)
  let hadQuotes = false;
  let escaping = false;

  const pushToken = (tokenEnd) => {
    if (tokenStart == null) return;
    tokens.push({
      value: buf,
      rawStart: tokenStart,
      rawEnd: tokenEnd,
      quoteChar,
      hadQuotes
    });
    buf = '';
    tokenStart = null;
    quote = null;
    quoteChar = null;
    hadQuotes = false;
    escaping = false;
  };

  while (i < src.length) {
    const ch = src[i];

    if (escaping) {
      if (tokenStart == null) tokenStart = i - 1;
      buf += ch;
      escaping = false;
      i += 1;
      continue;
    }

    if (ch === '\\') {
      // Escape next character in both quoted and unquoted contexts
      if (tokenStart == null) tokenStart = i;
      escaping = true;
      i += 1;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        hadQuotes = true;
        // Keep token open, but do not include quote
        i += 1;
        quote = null;
        continue;
      }
      if (tokenStart == null) tokenStart = i;
      buf += ch;
      i += 1;
      continue;
    }

    // Not in quotes
    if (ch === '"' || ch === "'") {
      if (tokenStart == null) tokenStart = i;
      quote = ch;
      quoteChar = ch;
      hadQuotes = true;
      i += 1;
      continue;
    }

    if (isWhitespace(ch)) {
      // Token boundary
      if (tokenStart != null) {
        pushToken(i);
      }
      // consume whitespace
      while (i < src.length && isWhitespace(src[i])) i += 1;
      continue;
    }

    if (tokenStart == null) tokenStart = i;
    buf += ch;
    i += 1;
  }

  // If there was a trailing backslash, treat it literally.
  if (escaping) {
    buf += '\\';
    escaping = false;
  }

  if (tokenStart != null) {
    pushToken(src.length);
  }

  const endsWithSpace = src.length > 0 && isWhitespace(src[src.length - 1]);

  return {
    tokens,
    endsWithSpace,
    unterminatedQuote: Boolean(quote)
  };
}

export function parseCommandLine(input) {
  const { tokens } = tokenizeCommandLine(input);
  const parts = tokens.map((t) => t.value);
  return {
    command: parts[0] || '',
    args: parts.slice(1)
  };
}

export function quoteArgIfNeeded(value, preferredQuote = '"') {
  const v = String(value ?? '');
  const needs = /\s|"|'|\\/.test(v);
  if (!needs) return v;

  const q = preferredQuote === "'" ? "'" : '"';
  if (q === "'") {
    // In single quotes, escape only single quotes and backslashes to be safe
    const escaped = v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `'${escaped}'`;
  }

  const escaped = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}
