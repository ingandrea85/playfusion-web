import type { Preview } from '@storybook/web-components-vite';
import '@playfusion/tokens/tokens.css';
import iconSprite from '../src/lib/icons/sprite.svg?raw';

// Inject sprite once at module load so all stories can <use href="#pf-icon-...">
if (!document.getElementById('pf-icon-sprite-host')) {
  const host = document.createElement('div');
  host.id = 'pf-icon-sprite-host';
  host.style.display = 'none';
  host.innerHTML = iconSprite;
  document.head.appendChild(host);
}

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
    backgrounds: {
      default: 'app',
      values: [
        { name: 'app', value: 'var(--color-surface-bg)' },
        { name: 'surface', value: 'var(--color-surface-default)' },
        { name: 'dark', value: '#0f172a' },
      ],
    },
  },
};

export default preview;
