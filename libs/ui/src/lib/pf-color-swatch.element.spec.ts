/// <reference lib="dom" />
import { describe, it, expect, afterEach } from 'vitest';
import './pf-color-swatch.element';

describe('PfColorSwatchElement', () => {
  let el: HTMLElement;
  afterEach(() => el?.remove());

  it('renders the color name and token reference', () => {
    el = document.createElement('pf-color-swatch');
    el.setAttribute('token', '--color-action-primary');
    el.setAttribute('label', 'Primary');
    document.body.appendChild(el);

    expect(el.querySelector('.pf-color-swatch__label')?.textContent).toBe('Primary');
    expect(el.querySelector('.pf-color-swatch__token')?.textContent).toBe('--color-action-primary');
  });

  it('uses the token in the swatch background', () => {
    el = document.createElement('pf-color-swatch');
    el.setAttribute('token', '--color-action-primary');
    el.setAttribute('label', 'Primary');
    document.body.appendChild(el);

    const swatch = el.querySelector<HTMLElement>('.pf-color-swatch__chip');
    // jsdom does not parse CSS var() into style.background; assert the raw inline style instead.
    expect(swatch?.getAttribute('style')).toMatch(/background:\s*var\(--color-action-primary\)/);
  });

  it('falls back to default token when input fails validation', () => {
    el = document.createElement('pf-color-swatch');
    el.setAttribute('token', '--color-action-primary); evil(');
    el.setAttribute('label', 'Bad');
    document.body.appendChild(el);

    const swatch = el.querySelector<HTMLElement>('.pf-color-swatch__chip');
    expect(swatch?.getAttribute('style')).toMatch(/background:\s*var\(--color-action-primary\)/);

    const tokenEl = el.querySelector('.pf-color-swatch__token');
    expect(tokenEl?.textContent).toBe('--color-action-primary'); // fallback shown
  });
});
