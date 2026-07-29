import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';
import './pf-color-swatch.element';

const meta: Meta = {
  title: 'Foundations/Colors',
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/design/XXX/PlayFusion-Design-System?node-id=YYY',
    },
  },
};
export default meta;

type Story = StoryObj;

const COLORS: Array<{ token: string; label: string }> = [
  { token: '--color-action-primary', label: 'Primary' },
  { token: '--color-action-primary-hover', label: 'Primary Hover' },
  { token: '--color-action-accent', label: 'Accent' },
  { token: '--color-feedback-success', label: 'Success' },
  { token: '--color-feedback-warning', label: 'Warning' },
  { token: '--color-feedback-danger', label: 'Danger' },
  { token: '--color-surface-default', label: 'Surface' },
  { token: '--color-text-default', label: 'Text Default' },
  { token: '--color-text-muted', label: 'Text Muted' },
];

export const AllColors: Story = {
  render: () =>
    html`
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; padding: 1rem;">
        ${COLORS.map(
          (c) => html`<pf-color-swatch token="${c.token}" label="${c.label}"></pf-color-swatch>`,
        )}
      </div>
    `,
};
