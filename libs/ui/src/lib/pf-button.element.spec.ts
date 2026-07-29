/// <reference lib="dom" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import './pf-button.element';
import './pf-spinner.element';
import './pf-icon.element';

function makeButton(attrs: Record<string, string> = {}, innerHTML = 'Click me'): HTMLElement {
  const el = document.createElement('pf-button');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.innerHTML = innerHTML;
  document.body.appendChild(el);
  return el;
}

describe('PfButtonElement', () => {
  let el: HTMLElement;
  afterEach(() => el?.remove());

  it('renders a native <button> inside', () => {
    el = makeButton();
    const btn = el.querySelector('button');
    expect(btn).not.toBeNull();
  });

  it('applies primary variant by default', () => {
    el = makeButton();
    const btn = el.querySelector('button');
    expect(btn?.classList.contains('pf-button--primary')).toBe(true);
  });

  it('applies each variant class', () => {
    for (const v of ['primary', 'secondary', 'ghost', 'danger', 'link']) {
      el = makeButton({ variant: v });
      expect(el.querySelector('button')?.classList.contains(`pf-button--${v}`)).toBe(true);
      el.remove();
    }
  });

  it('falls back to primary for unknown variant', () => {
    el = makeButton({ variant: 'rainbow' });
    expect(el.querySelector('button')?.classList.contains('pf-button--primary')).toBe(true);
  });

  it('applies size class md by default and other sizes when set', () => {
    el = makeButton();
    expect(el.querySelector('button')?.classList.contains('pf-button--md')).toBe(true);
    el.remove();
    el = makeButton({ size: 'lg' });
    expect(el.querySelector('button')?.classList.contains('pf-button--lg')).toBe(true);
  });

  it('passes through label text from light DOM', () => {
    el = makeButton({}, 'Salva');
    const label = el.querySelector('.pf-button__label');
    expect(label?.textContent).toBe('Salva');
  });

  it('reflects disabled attribute on inner button', () => {
    el = makeButton({ disabled: '' });
    const btn = el.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('reflects loading attribute and renders a spinner', () => {
    el = makeButton({ loading: '' });
    const btn = el.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(el.querySelector('pf-spinner')).not.toBeNull();
  });

  it('forwards type attribute (default button)', () => {
    el = makeButton();
    expect((el.querySelector('button') as HTMLButtonElement).type).toBe('button');
    el.remove();
    el = makeButton({ type: 'submit' });
    expect((el.querySelector('button') as HTMLButtonElement).type).toBe('submit');
  });

  it('falls back to type=button on unknown type', () => {
    el = makeButton({ type: 'evil' });
    expect((el.querySelector('button') as HTMLButtonElement).type).toBe('button');
  });

  it('does not emit click when disabled (native browser behavior)', () => {
    el = makeButton({ disabled: '' });
    const spy = vi.fn();
    el.addEventListener('click', spy);
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits click when enabled', () => {
    el = makeButton();
    const spy = vi.fn();
    el.addEventListener('click', spy);
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('renders icon-left slot before label', () => {
    el = makeButton({}, '<pf-icon name="plus" slot="icon-left"></pf-icon>Crea');
    const slots = el.querySelector('button')?.children;
    expect(slots?.[0].classList.contains('pf-button__icon-left')).toBe(true);
  });

  it('preserves label after attribute change (re-render)', async () => {
    el = makeButton({ variant: 'primary' }, 'Salva');
    el.setAttribute('variant', 'danger');
    await new Promise((r) => setTimeout(r, 0));
    const label = el.querySelector('.pf-button__label');
    expect(label?.textContent).toBe('Salva');
  });

  it('preserves icons after attribute change (re-render)', async () => {
    el = makeButton({ variant: 'primary' }, '<pf-icon name="plus" slot="icon-left"></pf-icon>Crea');
    el.setAttribute('variant', 'secondary');
    await new Promise((r) => setTimeout(r, 0));
    const iconWrap = el.querySelector('.pf-button__icon-left');
    expect(iconWrap?.querySelector('pf-icon')).not.toBeNull();
  });

  it('renders icon-right slot after label', () => {
    el = makeButton({}, 'Avanti<pf-icon name="chevron-right" slot="icon-right"></pf-icon>');
    const children = el.querySelector('button')?.children;
    const lastChild = children?.[children.length - 1];
    expect(lastChild?.classList.contains('pf-button__icon-right')).toBe(true);
  });

  it('applies pf-button--loading class when loading', () => {
    el = makeButton({ loading: '' });
    expect(el.querySelector('button')?.classList.contains('pf-button--loading')).toBe(true);
  });

  it('sets aria-busy="true" on the inner button when loading', () => {
    el = makeButton({ loading: '' });
    expect(el.querySelector('button')?.getAttribute('aria-busy')).toBe('true');
  });
});
