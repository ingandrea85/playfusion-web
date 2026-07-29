import './pf-badge.element.css';

const VALID_VARIANTS = new Set(['neutral', 'active', 'draft', 'done', 'warning', 'danger', 'success']);
const VALID_SIZES = new Set(['sm', 'md']);

export class PfBadgeElement extends HTMLElement {
  static observedAttributes = ['variant', 'size', 'dot'];

  private _label: string | null = null;

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  private render() {
    const rawVariant = this.getAttribute('variant') ?? 'neutral';
    const variant = VALID_VARIANTS.has(rawVariant) ? rawVariant : 'neutral';

    const rawSize = this.getAttribute('size') ?? 'md';
    const size = VALID_SIZES.has(rawSize) ? rawSize : 'md';

    const isDot = this.hasAttribute('dot');

    // Capture label from light DOM ONCE, on first render, before we wipe children.
    // Reading this.textContent on subsequent renders would return the label from
    // inside our own .pf-badge__label span (or '' after dot mode wiped it).
    if (this._label === null) {
      this._label = (this.textContent ?? '').trim();
    }

    this.replaceChildren();

    const root = document.createElement('span');
    root.className = `pf-badge pf-badge--${variant} pf-badge--${size}`;
    if (isDot) root.classList.add('pf-badge--dot');

    if (!isDot) {
      const label = document.createElement('span');
      label.className = 'pf-badge__label';
      label.textContent = this._label;
      root.appendChild(label);
    }

    this.appendChild(root);
  }
}

if (!customElements.get('pf-badge')) {
  customElements.define('pf-badge', PfBadgeElement);
}
