import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import './pf-badge.element';

const meta: Meta = {
  title: 'Primitives/Badge',
  argTypes: {
    variant: { control: 'select', options: ['neutral', 'active', 'draft', 'done', 'warning', 'danger', 'success'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    dot: { control: 'boolean' },
    text: { control: 'text' },
  },
  parameters: {
    design: { type: 'figma', url: 'https://www.figma.com/design/KJnYD8p5zHrUnVF1muZV1c/PlayFusion-Design-System?node-id=PRIMITIVE-BADGE' },
  },
};
export default meta;

type Story = StoryObj;

export const Single: Story = {
  args: { variant: 'active', size: 'md', dot: false, text: 'Live' },
  render: (args) => html`
    <pf-badge variant="${args['variant']}" size="${args['size']}" ?dot="${args['dot']}">${args['text']}</pf-badge>
  `,
};

const VARIANTS = ['neutral', 'active', 'draft', 'done', 'warning', 'danger', 'success'] as const;

export const AllVariants: Story = {
  render: () => html`
    <div style="display:flex; flex-wrap:wrap; gap:0.5rem; padding:1rem;">
      ${VARIANTS.map(v => html`<pf-badge variant="${v}">${v}</pf-badge>`)}
    </div>
  `,
};

export const Sizes: Story = {
  render: () => html`
    <div style="display:flex; align-items:center; gap:0.5rem; padding:1rem;">
      <pf-badge variant="active" size="sm">Small</pf-badge>
      <pf-badge variant="active" size="md">Medium</pf-badge>
    </div>
  `,
};

export const DotsOnly: Story = {
  render: () => html`
    <div style="display:flex; align-items:center; gap:1rem; padding:1rem;">
      ${VARIANTS.map(v => html`
        <div style="display:flex; align-items:center; gap:0.5rem; font:0.75rem ui-monospace, monospace; color:var(--color-text-muted);">
          <pf-badge variant="${v}" dot></pf-badge>
          <span>${v}</span>
        </div>
      `)}
    </div>
  `,
};
