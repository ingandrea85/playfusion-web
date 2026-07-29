import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import './pf-button.element';

const meta: Meta = {
  title: 'Primitives/Button',
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger', 'link'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
    label: { control: 'text' },
  },
  parameters: {
    design: { type: 'figma', url: 'https://www.figma.com/design/KJnYD8p5zHrUnVF1muZV1c/PlayFusion-Design-System?node-id=PRIMITIVE-BUTTON' },
  },
};
export default meta;

type Story = StoryObj;

export const Single: Story = {
  args: { variant: 'primary', size: 'md', disabled: false, loading: false, label: 'Salva' },
  render: (args) => html`
    <pf-button
      variant="${args['variant']}"
      size="${args['size']}"
      ?disabled="${args['disabled']}"
      ?loading="${args['loading']}"
    >${args['label']}</pf-button>
  `,
};

const VARIANTS = ['primary', 'secondary', 'ghost', 'danger', 'link'] as const;

export const AllVariants: Story = {
  render: () => html`
    <div style="display:flex; flex-wrap:wrap; gap:0.5rem; padding:1rem;">
      ${VARIANTS.map(v => html`<pf-button variant="${v}">${v}</pf-button>`)}
    </div>
  `,
};

export const Sizes: Story = {
  render: () => html`
    <div style="display:flex; align-items:center; gap:0.5rem; padding:1rem;">
      <pf-button variant="primary" size="sm">Small</pf-button>
      <pf-button variant="primary" size="md">Medium</pf-button>
      <pf-button variant="primary" size="lg">Large</pf-button>
    </div>
  `,
};

export const WithIcons: Story = {
  render: () => html`
    <div style="display:flex; flex-wrap:wrap; gap:0.5rem; padding:1rem;">
      <pf-button variant="primary">
        <pf-icon name="plus" slot="icon-left"></pf-icon>
        Crea torneo
      </pf-button>
      <pf-button variant="secondary">
        Avanti
        <pf-icon name="chevron-right" slot="icon-right"></pf-icon>
      </pf-button>
      <pf-button variant="danger">
        <pf-icon name="trash" slot="icon-left"></pf-icon>
        Elimina
      </pf-button>
      <pf-button variant="ghost" size="sm">
        <pf-icon name="edit" slot="icon-left"></pf-icon>
        Modifica
      </pf-button>
    </div>
  `,
};

export const States: Story = {
  render: () => html`
    <div style="display:flex; flex-wrap:wrap; gap:0.5rem; padding:1rem;">
      <pf-button variant="primary">Default</pf-button>
      <pf-button variant="primary" disabled>Disabled</pf-button>
      <pf-button variant="primary" loading>Loading</pf-button>
      <pf-button variant="secondary" loading>Saving...</pf-button>
    </div>
  `,
};
