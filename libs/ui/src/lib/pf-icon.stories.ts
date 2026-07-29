import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import './pf-icon.element';
import { ICON_NAMES } from './icons/icon-names.js';

const meta: Meta = {
  title: 'Primitives/Icon',
  argTypes: {
    name: { control: 'select', options: ICON_NAMES },
    size: { control: 'inline-radio', options: ['xs', 'sm', 'md', 'lg', 'xl'] },
    label: { control: 'text' },
  },
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/design/KJnYD8p5zHrUnVF1muZV1c/PlayFusion-Design-System?node-id=PRIMITIVE-ICON',
    },
  },
};
export default meta;

type Story = StoryObj;

export const Single: Story = {
  args: { name: 'check', size: 'md', label: '' },
  render: (args) => html`
    <pf-icon
      name="${args['name']}"
      size="${args['size']}"
      label="${args['label']}"
    ></pf-icon>
  `,
};

export const AllIcons: Story = {
  render: () => html`
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 1rem; padding: 1rem;">
      ${ICON_NAMES.map(
        (name) => html`
          <div style="display:flex; flex-direction:column; align-items:center; gap:0.25rem; font:0.75rem ui-monospace, monospace; color: var(--color-text-muted);">
            <pf-icon name="${name}" size="lg"></pf-icon>
            <span>${name}</span>
          </div>
        `,
      )}
    </div>
  `,
};

export const Sizes: Story = {
  render: () => html`
    <div style="display:flex; align-items:center; gap:1rem; padding:1rem;">
      ${(['xs', 'sm', 'md', 'lg', 'xl'] as const).map(
        (size) => html`
          <div style="display:flex; flex-direction:column; align-items:center; gap:0.25rem; font:0.75rem ui-monospace, monospace; color: var(--color-text-muted);">
            <pf-icon name="check-circle" size="${size}"></pf-icon>
            <span>${size}</span>
          </div>
        `,
      )}
    </div>
  `,
};

export const Colored: Story = {
  render: () => html`
    <div style="display:flex; align-items:center; gap:1.5rem; padding:1rem;">
      <div style="color: var(--color-action-primary);"><pf-icon name="check-circle" size="lg"></pf-icon></div>
      <div style="color: var(--color-feedback-success);"><pf-icon name="check-circle" size="lg"></pf-icon></div>
      <div style="color: var(--color-feedback-warning);"><pf-icon name="alert-triangle" size="lg"></pf-icon></div>
      <div style="color: var(--color-feedback-danger);"><pf-icon name="x" size="lg"></pf-icon></div>
      <div style="color: var(--color-text-muted);"><pf-icon name="info" size="lg"></pf-icon></div>
    </div>
  `,
};
