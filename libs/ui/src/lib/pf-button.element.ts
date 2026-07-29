import './pf-button.element.css';
// Side-effect imports so pf-spinner and pf-icon are registered when consumers use slots
import './pf-spinner.element.js';
import './pf-icon.element.js';

const VALID_VARIANTS = new Set(['primary', 'secondary', 'ghost', 'danger', 'link']);
const VALID_SIZES = new Set(['sm', 'md', 'lg']);
const VALID_TYPES = new Set(['button', 'submit', 'reset']);

export class PfButtonElement extends HTMLElement {
  static observedAttributes = ['variant', 'size', 'disabled', 'loading', 'type'];

  private _label: string | null = null;
  private _iconLeft: HTMLElement | null | undefined = undefined;
  private _iconRight: HTMLElement | null | undefined = undefined;

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  private render() {
    const rawVariant = this.getAttribute('variant') ?? 'primary';
    const variant = VALID_VARIANTS.has(rawVariant) ? rawVariant : 'primary';

    const rawSize = this.getAttribute('size') ?? 'md';
    const size = VALID_SIZES.has(rawSize) ? rawSize : 'md';

    const rawType = this.getAttribute('type') ?? 'button';
    const type = VALID_TYPES.has(rawType) ? rawType : 'button';

    const disabled = this.hasAttribute('disabled');
    const loading = this.hasAttribute('loading');

    // Capture light-DOM content on first render only, then reuse from cache.
    // undefined = "not captured yet", null = "captured, none present".
    if (this._iconLeft === undefined) {
      this._iconLeft = this.querySelector<HTMLElement>('[slot="icon-left"]');
    }
    if (this._iconRight === undefined) {
      this._iconRight = this.querySelector<HTMLElement>('[slot="icon-right"]');
    }
    if (this._label === null) {
      // Policy: default slot must be plain text. Inline markup (<em>, <strong>, etc.)
      // is dropped by design — use variant/CSS for emphasis instead.
      this._label = Array.from(this.childNodes)
        .filter((n): n is Text => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
    }

    this.replaceChildren();

    const btn = document.createElement('button');
    btn.type = type as 'button' | 'submit' | 'reset';
    btn.className = `pf-button pf-button--${variant} pf-button--${size}`;
    if (loading) btn.classList.add('pf-button--loading');
    btn.disabled = disabled || loading;
    if (loading) {
      btn.setAttribute('aria-busy', 'true');
    }

    if (this._iconLeft) {
      const wrap = document.createElement('span');
      wrap.className = 'pf-button__icon-left';
      wrap.appendChild(this._iconLeft);
      btn.appendChild(wrap);
    }

    const label = document.createElement('span');
    label.className = 'pf-button__label';
    label.textContent = this._label;
    btn.appendChild(label);

    if (this._iconRight) {
      const wrap = document.createElement('span');
      wrap.className = 'pf-button__icon-right';
      wrap.appendChild(this._iconRight);
      btn.appendChild(wrap);
    }

    if (loading) {
      const sp = document.createElement('pf-spinner');
      sp.className = 'pf-button__spinner';
      // Spinner is always sm — it replaces the label visually, regardless of button size
      sp.setAttribute('size', 'sm');
      sp.setAttribute('variant', variant === 'primary' || variant === 'danger' ? 'light' : 'primary');
      btn.appendChild(sp);
    }

    this.appendChild(btn);
  }
}

if (!customElements.get('pf-button')) {
  customElements.define('pf-button', PfButtonElement);
}
