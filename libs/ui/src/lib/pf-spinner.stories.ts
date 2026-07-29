import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import './pf-spinner.element';

const meta: Meta = {
  title: 'Primitives/Spinner',
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    variant: { control: 'inline-radio', options: ['primary', 'light'] },
    label: { control: 'text' },
  },
  parameters: {
    design: { type: 'figma', url: 'https://www.figma.com/design/KJnYD8p5zHrUnVF1muZV1c/PlayFusion-Design-System?node-id=PRIMITIVE-SPINNER' },
  },
};
export default meta;

type Story = StoryObj;

export const Single: Story = {
  args: { size: 'md', variant: 'primary', label: 'Loading' },
  render: (args) => html`
    <pf-spinner size="${args['size']}" variant="${args['variant']}" label="${args['label']}"></pf-spinner>
  `,
};

export const Sizes: Story = {
  render: () => html`
    <div style="display:flex; align-items:center; gap:1.5rem; padding:1rem;">
      ${(['sm', 'md', 'lg'] as const).map(size => html`
        <div style="display:flex; flex-direction:column; align-items:center; gap:0.5rem; font:0.75rem ui-monospace, monospace; color:var(--color-text-muted);">
          <pf-spinner size="${size}"></pf-spinner>
          <span>${size}</span>
        </div>
      `)}
    </div>
  `,
};

export const OnDarkBackground: Story = {
  parameters: { backgrounds: { default: 'dark' } },
  render: () => html`
    <div style="display:flex; align-items:center; gap:1.5rem; padding:2rem;">
      <pf-spinner size="lg" variant="light"></pf-spinner>
    </div>
  `,
};
