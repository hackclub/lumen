const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const HTML_TAG_RE = /<[^>]+>/g;
const IMAGE_RE = /!\[[^\]]*]\(([^)]+)\)/g;
const IMPORT_EXPORT_RE = /^(?:import|export)\s.+$/gm;
const CODE_FENCE_RE = /```[\s\S]*?```/g;
const HEADING_RE = /^#{1,6}\s/;
const LIST_RE = /^(?:[-*+]|\d+\.)\s/;
const WHITESPACE_RE = /\s+/g;

export const SITE_TITLE = 'Hack Club Lumen';
export const GUIDE_SITE_TITLE = 'Lumen Guides';
export const HOMEPAGE_TITLE = 'Hack Club Lumen';
export const HOMEPAGE_DESCRIPTION =
  'Hack Club Lumen teaches you how to build Minecraft shaderpacks with step-by-step guides, community support, and prizes for submitted work.';
export const OG_BANNER_PATH = '/img/opengraph-banner.png';

function normalizePathname(pathname: string) {
  if (!pathname || pathname === '/') return '/';
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

export function buildCanonicalHref(pathname: string, site?: URL) {
  const normalizedPath = normalizePathname(pathname);
  return site ? new URL(normalizedPath, site).toString() : normalizedPath;
}

export function buildAssetHref(path: string, site?: URL) {
  return site ? new URL(path, site).toString() : path;
}

function cleanParagraph(block: string) {
  return block
    .replace(IMAGE_RE, ' ')
    .replace(MARKDOWN_LINK_RE, '$1')
    .replace(INLINE_CODE_RE, '$1')
    .replace(HTML_TAG_RE, ' ')
    .replace(/[*_~]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(WHITESPACE_RE, ' ')
    .trim();
}

function getIntroParagraphs(source: string) {
  const blocks = source
    .replace(/\r\n/g, '\n')
    .replace(IMPORT_EXPORT_RE, '')
    .replace(CODE_FENCE_RE, '')
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const paragraphs: string[] = [];

  for (const block of blocks) {
    if (block.startsWith('<') && !block.startsWith('<a ')) continue;
    if (HEADING_RE.test(block) || LIST_RE.test(block)) continue;

    const cleaned = cleanParagraph(block);
    const letterCount = (cleaned.match(/[A-Za-z]/g) ?? []).length;
    if (!cleaned || cleaned.length < 40) continue;
    if (letterCount < Math.max(20, Math.floor(cleaned.length * 0.45))) continue;

    paragraphs.push(cleaned);
  }

  return paragraphs;
}

export function extractGuideDescription(
  source: string,
  fallback?: string,
  paragraphCount = 3
) {
  const introParagraphs = getIntroParagraphs(source).slice(0, paragraphCount);
  if (introParagraphs.length > 0) return introParagraphs.join(' ');
  return fallback ? cleanParagraph(fallback) : undefined;
}
