export const ICON_NAMES = [
  'check',
  'x',
  'chevron-down',
  'chevron-up',
  'chevron-left',
  'chevron-right',
  'plus',
  'search',
  'trash',
  'edit',
  'info',
  'alert-triangle',
  'check-circle',
  'more-horizontal',
  'square',
] as const;

export type IconName = typeof ICON_NAMES[number];
