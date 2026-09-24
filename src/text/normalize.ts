import { convert } from 'html-to-text';

const ELLIPSIS = '…';

/**
 * Converts an HTML fragment into a single line of plain text.
 */
export function stripHtml(html: string): string {
  if (html.trim() === '') {
    return '';
  }

  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lowercases the text and removes diacritics so aliases match reliably.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Shortens the text to `maxLength` characters, appending an ellipsis when cut.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}${ELLIPSIS}`;
}
