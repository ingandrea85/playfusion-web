/// <reference lib="dom" />
import { describe, it, expect, afterEach } from 'vitest';
import './pf-icon.element';

function makeIcon(attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement('pf-icon');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

describe('PfIconElement', () => {
  let el: HTMLElement;
  afterEach(() => el?.remove());

  it('renders an svg referencing the named symbol', () => {
    el = makeIcon({ name: 'check' });
    const use = el.querySelector('use');
    expect(use?.getAttribute('href')).toBe('#pf-icon-check');
  });

  it('falls back to "square" when name is missing', () => {
    el = makeIcon();
    const use = el.querySelector('use');
    expect(use?.getAttribute('href')).toBe('#pf-icon-square');
  });

  it('rejects names with invalid characters (XSS safety)', () => {
    el = makeIcon({ name: 'check"><script>alert(1)</script>' });
    const use = el.querySelector('use');
    // falls back to square because the name failed validation
    expect(use?.getAttribute('href')).toBe('#pf-icon-square');
    expect(el.querySelector('script')).toBeNull();
    expect(el.innerHTML).not.toContain('<script');
  });

  it('applies size class for size md (default)', () => {
    el = makeIcon({ name: 'check' });
    const svg = el.querySelector('svg');
    expect(svg?.classList.contains('pf-icon--md')).toBe(true);
  });

  it('applies size class for each named size', () => {
    for (const size of ['xs', 'sm', 'md', 'lg', 'xl']) {
      el = makeIcon({ name: 'check', size });
      const svg = el.querySelector('svg');
      expect(svg?.classList.contains(`pf-icon--${size}`)).toBe(true);
      el.remove();
    }
  });

  it('sets aria-label and role when label provided', () => {
    el = makeIcon({ name: 'check', label: 'Saved' });
    const svg = el.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Saved');
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('sets aria-hidden when no label (decorative icon)', () => {
    el = makeIcon({ name: 'check' });
    const svg = el.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('aria-label')).toBeNull();
  });

  it('re-renders when name attribute changes', async () => {
    el = makeIcon({ name: 'check' });
    el.setAttribute('name', 'x');
    await new Promise((r) => setTimeout(r, 0));
    const use = el.querySelector('use');
    expect(use?.getAttribute('href')).toBe('#pf-icon-x');
  });

  it('sets xlink:href alongside href on the use element', () => {
    el = makeIcon({ name: 'check' });
    const use = el.querySelector('use');
    expect(use?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#pf-icon-check');
  });

  it('falls back to md when size is invalid', () => {
    el = makeIcon({ name: 'check', size: 'huge' });
    const svg = el.querySelector('svg');
    expect(svg?.classList.contains('pf-icon--md')).toBe(true);
  });

  it('re-renders when label attribute changes', async () => {
    el = makeIcon({ name: 'check' });
    el.setAttribute('label', 'Saved');
    await new Promise((r) => setTimeout(r, 0));
    const svg = el.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Saved');
    expect(svg?.getAttribute('role')).toBe('img');
  });
});
