import { describe, expect, it } from 'vitest';

import { normalizeText, stripHtml, truncate } from '../src/text/normalize.js';

describe('stripHtml', () => {
  it('removes tags and keeps the text', () => {
    expect(stripHtml('<p>Olá <strong>mundo</strong></p>')).toBe('Olá mundo');
  });

  it('collapses whitespace and newlines', () => {
    expect(stripHtml('<p>uma</p>\n\n<p>   duas  </p>')).toBe('uma duas');
  });

  it('returns an empty string for empty input', () => {
    expect(stripHtml('')).toBe('');
  });
});

describe('normalizeText', () => {
  it('lowercases the text', () => {
    expect(normalizeText('PETROBRAS')).toBe('petrobras');
  });

  it('strips accents', () => {
    expect(normalizeText('Petrobrás Ações')).toBe('petrobras acoes');
  });

  it('keeps numbers and punctuation', () => {
    expect(normalizeText('PETR4 sobe 2,5%')).toBe('petr4 sobe 2,5%');
  });
});

describe('truncate', () => {
  it('returns the text unchanged when within the limit', () => {
    expect(truncate('curto', 10)).toBe('curto');
  });

  it('cuts and appends an ellipsis when over the limit', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde…');
  });

  it('trims trailing whitespace before the ellipsis', () => {
    expect(truncate('abcde fghij', 6)).toBe('abcde…');
  });
});
