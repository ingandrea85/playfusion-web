import './pf-icon.element.css';

const VALID_NAME = /^[a-z][a-z0-9-]*$/;
const VALID_SIZES = new Set(['xs', 'sm', 'md', 'lg', 'xl']);
const FALLBACK_NAME = 'square';
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

export class PfIconElement extends HTMLElement {
  static observedAttributes = ['name', 'size', 'label'];

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  private render() {
    const rawName = this.getAttribute('name') ?? FALLBACK_NAME;
    const name = VALID_NAME.test(rawName) ? rawName : FALLBACK_NAME;

    const rawSize = this.getAttribute('size') ?? 'md';
    const size = VALID_SIZES.has(rawSize) ? rawSize : 'md';

    const label = this.getAttribute('label');

    this.replaceChildren();

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('pf-icon', `pf-icon--${size}`);

    if (label) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', label);
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }

    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#pf-icon-${name}`);
    // Some older browsers / tooling only honor xlink:href
    use.setAttributeNS(XLINK_NS, 'xlink:href', `#pf-icon-${name}`);
    svg.appendChild(use);

    this.appendChild(svg);
  }
}

if (!customElements.get('pf-icon')) {
  customElements.define('pf-icon', PfIconElement);
}
