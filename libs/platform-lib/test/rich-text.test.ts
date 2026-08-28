import { test, expect } from 'vitest';
import { sanitizeRichHtml, richTextOrUndefined } from '../src/rich-text.js';

test('keeps allowed formatting tags', () => {
  const html = '<h2>Titolo</h2><p><strong>Grassetto</strong> <em>corsivo</em></p><ul><li>uno</li></ul>';
  expect(sanitizeRichHtml(html)).toBe(html.replace('<h2>', '<h2>')); // unchanged
});

test('strips scripts, event handlers and styles', () => {
  const dirty = '<p onclick="evil()">ok</p><script>alert(1)</script><p style="x">y</p>';
  const clean = sanitizeRichHtml(dirty);
  expect(clean).not.toContain('script');
  expect(clean).not.toContain('onclick');
  expect(clean).not.toContain('style');
  expect(clean).toContain('ok');
});

test('drops images (not allowed) but keeps links, forcing safe rel/target', () => {
  const clean = sanitizeRichHtml('<p><img src="x.png"><a href="https://x.it">link</a></p>');
  expect(clean).not.toContain('<img');
  expect(clean).toContain('href="https://x.it"');
  expect(clean).toContain('rel="noopener noreferrer"');
  expect(clean).toContain('target="_blank"');
});

test('drops javascript: URLs', () => {
  expect(sanitizeRichHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
});

test('richTextOrUndefined collapses empty content to undefined', () => {
  expect(richTextOrUndefined('<p><br></p>')).toBeUndefined();
  expect(richTextOrUndefined('   ')).toBeUndefined();
  expect(richTextOrUndefined('<p>Ciao</p>')).toBe('<p>Ciao</p>');
});
