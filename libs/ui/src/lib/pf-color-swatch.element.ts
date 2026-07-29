import './pf-color-swatch.element.css';

// CSS custom property names per spec: '--' prefix + [a-zA-Z0-9-_]
// Strict whitelist closes the CSS-injection vector via the `token` attribute.
const VALID_TOKEN = /^--[a-zA-Z0-9_-]+$/;

export class PfColorSwatchElement extends HTMLElement {
  static observedAttributes = ['token', 'label'];

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  private render() {
    const rawToken = this.getAttribute('token') ?? '--color-action-primary';
    const token = VALID_TOKEN.test(rawToken) ? rawToken : '--color-action-primary';
    const label = this.getAttribute('label') ?? '';

    this.replaceChildren();

    const root = document.createElement('div');
    root.className = 'pf-color-swatch';

    const chip = document.createElement('div');
    chip.className = 'pf-color-swatch__chip';
    // setAttribute round-trips reliably across jsdom + browsers; var() preserved.
    // Safe because `token` is validated against VALID_TOKEN above.
    chip.setAttribute('style', `background: var(${token})`);
    root.appendChild(chip);

    const labelEl = document.createElement('div');
    labelEl.className = 'pf-color-swatch__label';
    labelEl.textContent = label;
    root.appendChild(labelEl);

    const tokenEl = document.createElement('div');
    tokenEl.className = 'pf-color-swatch__token';
    tokenEl.textContent = token;
    root.appendChild(tokenEl);

    this.appendChild(root);
  }
}

if (!customElements.get('pf-color-swatch')) {
  customElements.define('pf-color-swatch', PfColorSwatchElement);
}
