/// <reference lib="dom" />
import { describe, it, expect, afterEach } from 'vitest';
import './pf-spinner.element';

function makeSpinner(attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement('pf-spinner');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

describe('PfSpinnerElement', () => {
  let el: HTMLElement;
  afterEach(() => el?.remove());

  it('renders with md size and primary variant by default', () => {
    el = makeSpinner();
    const inner = el.querySelector('.pf-spinner');
    expect(inner?.classList.contains('pf-spinner--md')).toBe(true);
    expect(inner?.classList.contains('pf-spinner--primary')).toBe(true);
  });

  it('applies size class for each named size', () => {
    for (const size of ['sm', 'md', 'lg']) {
      el = makeSpinner({ size });
      expect(el.querySelector('.pf-spinner')?.classList.contains(`pf-spinner--${size}`)).toBe(true);
      el.remove();
    }
  });

  it('applies variant class for primary and light', () => {
    el = makeSpinner({ variant: 'light' });
    expect(el.querySelector('.pf-spinner')?.classList.contains('pf-spinner--light')).toBe(true);
  });

  it('falls back to primary for unknown variant', () => {
    el = makeSpinner({ variant: 'rainbow' });
    expect(el.querySelector('.pf-spinner')?.classList.contains('pf-spinner--primary')).toBe(true);
  });

  it('has role="status" and aria-label for screen readers', () => {
    el = makeSpinner({ label: 'Salvataggio in corso' });
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-label')).toBe('Salvataggio in corso');
  });

  it('defaults aria-label to "Loading" when no label given', () => {
    el = makeSpinner();
    expect(el.getAttribute('aria-label')).toBe('Loading');
  });

  it('falls back to md when size is invalid', () => {
    el = makeSpinner({ size: 'huge' });
    expect(el.querySelector('.pf-spinner')?.classList.contains('pf-spinner--md')).toBe(true);
  });

  it('re-renders when label attribute changes', async () => {
    el = makeSpinner({ label: 'Caricamento' });
    el.setAttribute('label', 'Salvataggio');
    await new Promise((r) => setTimeout(r, 0));
    expect(el.getAttribute('aria-label')).toBe('Salvataggio');
  });

  it('falls back to "Loading" when label is empty string', () => {
    el = makeSpinner({ label: '' });
    expect(el.getAttribute('aria-label')).toBe('Loading');
  });
});
