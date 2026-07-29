import './pf-spinner.element.css';

const VALID_SIZES = new Set(['sm', 'md', 'lg']);
const VALID_VARIANTS = new Set(['primary', 'light']);

export class PfSpinnerElement extends HTMLElement {
  static observedAttributes = ['size', 'variant', 'label'];

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  private render() {
    const rawSize = this.getAttribute('size') ?? 'md';
    const size = VALID_SIZES.has(rawSize) ? rawSize : 'md';

    const rawVariant = this.getAttribute('variant') ?? 'primary';
    const variant = VALID_VARIANTS.has(rawVariant) ? rawVariant : 'primary';

    const rawLabel = this.getAttribute('label');
    const label = rawLabel && rawLabel.trim() ? rawLabel : 'Loading';

    this.setAttribute('role', 'status');
    this.setAttribute('aria-label', label);

    this.replaceChildren();

    const ring = document.createElement('span');
    ring.className = `pf-spinner pf-spinner--${size} pf-spinner--${variant}`;
    this.appendChild(ring);
  }
}

if (!customElements.get('pf-spinner')) {
  customElements.define('pf-spinner', PfSpinnerElement);
}
