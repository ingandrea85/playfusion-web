/// <reference lib="dom" />
import { describe, it, expect, afterEach } from 'vitest';
import './pf-badge.element';

function makeBadge(attrs: Record<string, string> = {}, text = 'Label'): HTMLElement {
  const el = document.createElement('pf-badge');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

describe('PfBadgeElement', () => {
  let el: HTMLElement;
  afterEach(() => el?.remove());

  it('renders with neutral variant by default', () => {
    el = makeBadge();
    const inner = el.querySelector('.pf-badge');
    expect(inner?.classList.contains('pf-badge--neutral')).toBe(true);
  });

  it('applies variant class for each named variant', () => {
    for (const v of ['neutral', 'active', 'draft', 'done', 'warning', 'danger', 'success']) {
      el = makeBadge({ variant: v });
      const inner = el.querySelector('.pf-badge');
      expect(inner?.classList.contains(`pf-badge--${v}`)).toBe(true);
      el.remove();
    }
  });

  it('falls back to neutral for unknown variant', () => {
    el = makeBadge({ variant: 'rainbow' });
    const inner = el.querySelector('.pf-badge');
    expect(inner?.classList.contains('pf-badge--neutral')).toBe(true);
  });

  it('applies size class md by default and sm when set', () => {
    el = makeBadge();
    expect(el.querySelector('.pf-badge')?.classList.contains('pf-badge--md')).toBe(true);
    el.remove();
    el = makeBadge({ size: 'sm' });
    expect(el.querySelector('.pf-badge')?.classList.contains('pf-badge--sm')).toBe(true);
  });

  it('renders text content from light DOM into label', () => {
    el = makeBadge({ variant: 'active' }, 'Live');
    expect(el.querySelector('.pf-badge__label')?.textContent).toBe('Live');
  });

  it('renders dot-only mode when dot attribute present', () => {
    el = makeBadge({ variant: 'success', dot: '' }, 'ignored');
    expect(el.querySelector('.pf-badge')?.classList.contains('pf-badge--dot')).toBe(true);
    expect(el.querySelector('.pf-badge__label')).toBeNull();
  });

  it('re-renders when variant attribute changes', async () => {
    el = makeBadge({ variant: 'neutral' });
    el.setAttribute('variant', 'danger');
    await new Promise((r) => setTimeout(r, 0));
    expect(el.querySelector('.pf-badge')?.classList.contains('pf-badge--danger')).toBe(true);
  });

  it('falls back to md when size is invalid', () => {
    el = makeBadge({ size: 'huge' });
    expect(el.querySelector('.pf-badge')?.classList.contains('pf-badge--md')).toBe(true);
  });

  it('switches to dot mode when dot attribute is added dynamically', async () => {
    el = makeBadge({ variant: 'active' }, 'Live');
    el.setAttribute('dot', '');
    await new Promise((r) => setTimeout(r, 0));
    expect(el.querySelector('.pf-badge')?.classList.contains('pf-badge--dot')).toBe(true);
    expect(el.querySelector('.pf-badge__label')).toBeNull();
  });

  it('restores label when exiting dot mode (round-trip)', async () => {
    el = makeBadge({ variant: 'active' }, 'Live');
    el.setAttribute('dot', '');
    await new Promise((r) => setTimeout(r, 0));
    el.removeAttribute('dot');
    await new Promise((r) => setTimeout(r, 0));
    expect(el.querySelector('.pf-badge__label')?.textContent).toBe('Live');
  });
});
