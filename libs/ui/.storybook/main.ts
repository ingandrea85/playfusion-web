import type { StorybookConfig } from '@storybook/web-components-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|js)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-designs'],
  framework: { name: '@storybook/web-components-vite', options: {} },
};

export default config;
