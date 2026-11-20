import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

export interface ExternalUrlViolation {
  file: string;
  url: string;
  index: number;
}

const SCANNED_EXTENSIONS = new Set(['.html', '.js', '.css']);

/**
 * Matches http(s), ws(s), and protocol-relative URLs.
 * Requires a dotted hostname so ordinary `//` comments are ignored.
 */
const URL_RE =
  /(?<![a-z0-9_])(?:(?:https?|wss?):\/\/|\/\/)(?!\/)[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/[^\s"'`<>\\)]*)?/gi;

const REPO_ROOTS = new Set([
  'https://github.com/pengrunyi/visual-fx',
  'http://github.com/pengrunyi/visual-fx',
  'https://pengrunyi.github.io/visual-fx',
  'http://pengrunyi.github.io/visual-fx',
]);

export interface TextFile {
  path: string;
  text: string;
}

function normalizeUrl(raw: string): string {
  return raw.replace(/[),.;:]+$/g, '').replace(/\/+$/g, '').toLowerCase();
}

/**
 * DOM / XML namespace identifiers. Browsers do not fetch these.
 * `http://www.w3.org/2000/svg` is the SVG namespace; `http://www.w3.org/1999/xhtml`
 * is the HTML namespace Three.js passes to createElementNS.
 */
const NON_FETCHED_NAMESPACES = [
  'www.w3.org/2000/svg',
  'www.w3.org/1999/xhtml',
  'www.w3.org/1999/xlink',
];

function isNonFetchedNamespace(url: string): boolean {
  const hostAndPath = url.replace(/^(?:https?:)?\/\//i, '').toLowerCase();
  return NON_FETCHED_NAMESPACES.some((prefix) => hostAndPath.startsWith(prefix));
}

/** A plain `<a href="...repo">` to the GitHub repo or Pages root is allowed. */
function isPlainRepoAnchor(text: string, urlStart: number, normalized: string): boolean {
  if (!REPO_ROOTS.has(normalized)) return false;
  const before = text.slice(Math.max(0, urlStart - 220), urlStart);
  const anchorAt = before.toLowerCase().lastIndexOf('<a');
  if (anchorAt < 0) return false;
  const scriptAt = before.toLowerCase().lastIndexOf('<script');
  const linkAt = before.toLowerCase().lastIndexOf('<link');
  if (scriptAt > anchorAt || linkAt > anchorAt) return false;
  const fromAnchor = before.slice(anchorAt);
  return /<a\b[^>]*\bhref\s*=\s*['"]$/i.test(fromAnchor);
}

export function findExternalUrls(files: TextFile[]): ExternalUrlViolation[] {
  const violations: ExternalUrlViolation[] = [];
  for (const file of files) {
    URL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = URL_RE.exec(file.text))) {
      const url = match[0];
      if (isNonFetchedNamespace(url)) continue;
      const normalized = normalizeUrl(url.startsWith('//') ? `https:${url}` : url);
      if (isPlainRepoAnchor(file.text, match.index, normalized)) continue;
      violations.push({ file: file.path, url, index: match.index });
    }
  }
  return violations;
}

export function collectTextFiles(rootDir: string): TextFile[] {
  const files: TextFile[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path);
        continue;
      }
      if (!SCANNED_EXTENSIONS.has(extname(name).toLowerCase())) continue;
      files.push({ path, text: readFileSync(path, 'utf8') });
    }
  };
  walk(rootDir);
  return files;
}

export function findViolationsInDir(rootDir: string): ExternalUrlViolation[] {
  return findExternalUrls(collectTextFiles(rootDir));
}
