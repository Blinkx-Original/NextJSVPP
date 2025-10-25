const DANGEROUS_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'meta',
  'link',
  'base',
  'textarea',
  'template',
  'applet',
  'frame',
  'frameset'
];

const EVENT_HANDLER_ATTRIBUTE = /\son[a-z]+\s*=\s*("|').*?\1/gi;
const JAVASCRIPT_PROTOCOL = /(href|src)\s*=\s*("|')\s*javascript:[^"']*("|')/gi;
const DATA_PROTOCOL = /(src)\s*=\s*("|')\s*data:[^"']*("|')/gi;

export const DESCRIPTION_MAX_LENGTH = 150_000;

function buildTagPattern(tags: string[], includeContent: boolean): RegExp {
  const tagAlternation = tags.join('|');
  if (includeContent) {
    return new RegExp(`<(${tagAlternation})[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi');
  }
  return new RegExp(`<\\/?(${tagAlternation})[^>]*>`, 'gi');
}

const DANGEROUS_TAG_CONTENT = buildTagPattern(DANGEROUS_TAGS, true);
const DANGEROUS_TAG_SINGLE = buildTagPattern(DANGEROUS_TAGS, false);

export function sanitizeProductHtml(html: string): string {
  if (typeof html !== 'string') {
    return '';
  }

  let output = html;
  output = output.replace(DANGEROUS_TAG_CONTENT, '');
  output = output.replace(DANGEROUS_TAG_SINGLE, '');
  output = output.replace(EVENT_HANDLER_ATTRIBUTE, '');
  output = output.replace(JAVASCRIPT_PROTOCOL, '$1="#"');
  output = output.replace(DATA_PROTOCOL, '$1="#"');

  return output;
}

export interface HtmlMetrics {
  characters: number;
  textLength: number;
  words: number;
  sanitized: string;
}

export function measureHtmlContent(html: string): HtmlMetrics {
  const sanitized = sanitizeProductHtml(html);
  const textOnly = sanitized
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ');

  const normalized = textOnly.replace(/\s+/g, ' ').trim();
  const words = normalized.length > 0 ? normalized.split(' ').length : 0;

  return {
    characters: sanitized.length,
    textLength: normalized.length,
    words,
    sanitized
  };
}
