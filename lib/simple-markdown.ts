function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return '#';
  }

  if (/^(https?:|mailto:|\/)/i.test(trimmed)) {
    try {
      return encodeURI(trimmed);
    } catch {
      return '#';
    }
  }

  return '#';
}

function renderInlineWithoutLinks(segment: string): string {
  let escaped = escapeHtml(segment);
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/\*(.+?)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
  return escaped;
}

function renderInline(text: string): string {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    const label = match[1];
    const url = match[2];
    result += renderInlineWithoutLinks(before);
    result += `<a href="${escapeAttribute(sanitizeUrl(url))}">${renderInlineWithoutLinks(label)}</a>`;
    lastIndex = match.index + match[0].length;
  }

  result += renderInlineWithoutLinks(text.slice(lastIndex));
  return result;
}

export function renderMarkdown(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const html: string[] = [];
  let paragraphBuffer: string[] = [];
  let listBuffer: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) {
      return;
    }
    const text = paragraphBuffer.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 0) {
      html.push(`<p>${renderInline(text)}</p>`);
    }
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer || listBuffer.items.length === 0) {
      listBuffer = null;
      return;
    }
    const tag = listBuffer.type === 'ol' ? 'ol' : 'ul';
    const items = listBuffer.items.map((item) => `<li>${item}</li>`).join('');
    html.push(`<${tag}>${items}</${tag}>`);
    listBuffer = null;
  };

  const pushListItem = (type: 'ul' | 'ol', content: string) => {
    if (!listBuffer || listBuffer.type !== type) {
      flushList();
      listBuffer = { type, items: [] };
    }
    listBuffer.items.push(renderInline(content.trim()));
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = Math.min(headingMatch[1].length, 4);
      const headingText = headingMatch[2].trim();
      html.push(`<h${level}>${renderInline(headingText)}</h${level}>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      const itemText = trimmed.replace(/^[-*]\s+/, '');
      pushListItem('ul', itemText);
      continue;
    }

    if (/^\d+[\.)]\s+/.test(trimmed)) {
      flushParagraph();
      const itemText = trimmed.replace(/^\d+[\.)]\s+/, '');
      pushListItem('ol', itemText);
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushParagraph();
      flushList();
      html.push('<hr />');
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();

  return html.join('\n');
}
