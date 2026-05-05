export type ThemePresetName = 'aura' | 'lara' | 'nora' | 'material';
export type ThemePrimaryName = 'blue' | 'emerald' | 'violet' | 'amber' | 'cyan' | 'teal' | 'indigo' | 'rose' | 'pink' | 'lime';

export interface ThemeOption {
  label: string;
  value: string;
  preset: ThemePresetName;
  primary: ThemePrimaryName;
  primaryHex: string;
  isHighContrast?: boolean;
  /**
   * Modalita' chiaro/scuro preferita per il tema. Valorizzata solo sui
   * temi accessibility per pre-settare il `theme-dark` class al momento
   * della selezione. Lasciando undefined il toggle utente resta libero.
   */
  highContrastMode?: 'light' | 'dark';
}

export const PRIMARY_PALETTES: Record<ThemePrimaryName, Record<string, string>> = {
  blue: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554' },
  emerald: { 50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b', 950: '#022c22' },
  violet: { 50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065' },
  amber: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03' },
  cyan: { 50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63', 950: '#083344' },
  teal: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e' },
  indigo: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81', 950: '#1e1b4b' },
  rose: { 50: '#fff1f2', 100: '#ffe4e6', 200: '#fecdd3', 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239', 900: '#881337', 950: '#4c0519' },
  pink: { 50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d', 900: '#831843', 950: '#500724' },
  lime: { 50: '#f7fee7', 100: '#ecfccb', 200: '#d9f99d', 300: '#bef264', 400: '#a3e635', 500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f', 800: '#3f6212', 900: '#365314', 950: '#1a2e05' }
};

export const THEME_OPTIONS: ThemeOption[] = [
  { label: 'Accessibilita Alto Contrasto (Light)', value: 'a11y-high-contrast', preset: 'aura', primary: 'blue', primaryHex: '#000000', isHighContrast: true, highContrastMode: 'light' },
  { label: 'Accessibilita Alto Contrasto (Dark)', value: 'a11y-high-contrast-dark', preset: 'aura', primary: 'blue', primaryHex: '#ffff00', isHighContrast: true, highContrastMode: 'dark' },
  { label: 'Aura Blue', value: 'aura-blue', preset: 'aura', primary: 'blue', primaryHex: PRIMARY_PALETTES.blue['500'] },
  { label: 'Aura Emerald', value: 'aura-emerald', preset: 'aura', primary: 'emerald', primaryHex: PRIMARY_PALETTES.emerald['500'] },
  { label: 'Aura Violet', value: 'aura-violet', preset: 'aura', primary: 'violet', primaryHex: PRIMARY_PALETTES.violet['500'] },
  { label: 'Aura Amber', value: 'aura-amber', preset: 'aura', primary: 'amber', primaryHex: PRIMARY_PALETTES.amber['500'] },
  { label: 'Aura Cyan', value: 'aura-cyan', preset: 'aura', primary: 'cyan', primaryHex: PRIMARY_PALETTES.cyan['500'] },
  { label: 'Aura Teal', value: 'aura-teal', preset: 'aura', primary: 'teal', primaryHex: PRIMARY_PALETTES.teal['500'] },
  { label: 'Aura Indigo', value: 'aura-indigo', preset: 'aura', primary: 'indigo', primaryHex: PRIMARY_PALETTES.indigo['500'] },
  { label: 'Aura Rose', value: 'aura-rose', preset: 'aura', primary: 'rose', primaryHex: PRIMARY_PALETTES.rose['500'] },
  { label: 'Lara Blue', value: 'lara-blue', preset: 'lara', primary: 'blue', primaryHex: PRIMARY_PALETTES.blue['500'] },
  { label: 'Lara Emerald', value: 'lara-emerald', preset: 'lara', primary: 'emerald', primaryHex: PRIMARY_PALETTES.emerald['500'] },
  { label: 'Lara Violet', value: 'lara-violet', preset: 'lara', primary: 'violet', primaryHex: PRIMARY_PALETTES.violet['500'] },
  { label: 'Lara Amber', value: 'lara-amber', preset: 'lara', primary: 'amber', primaryHex: PRIMARY_PALETTES.amber['500'] },
  { label: 'Lara Cyan', value: 'lara-cyan', preset: 'lara', primary: 'cyan', primaryHex: PRIMARY_PALETTES.cyan['500'] },
  { label: 'Lara Teal', value: 'lara-teal', preset: 'lara', primary: 'teal', primaryHex: PRIMARY_PALETTES.teal['500'] },
  { label: 'Lara Indigo', value: 'lara-indigo', preset: 'lara', primary: 'indigo', primaryHex: PRIMARY_PALETTES.indigo['500'] },
  { label: 'Lara Pink', value: 'lara-pink', preset: 'lara', primary: 'pink', primaryHex: PRIMARY_PALETTES.pink['500'] },
  { label: 'Nora Blue', value: 'nora-blue', preset: 'nora', primary: 'blue', primaryHex: PRIMARY_PALETTES.blue['500'] },
  { label: 'Nora Emerald', value: 'nora-emerald', preset: 'nora', primary: 'emerald', primaryHex: PRIMARY_PALETTES.emerald['500'] },
  { label: 'Nora Rose', value: 'nora-rose', preset: 'nora', primary: 'rose', primaryHex: PRIMARY_PALETTES.rose['500'] },
  { label: 'Nora Lime', value: 'nora-lime', preset: 'nora', primary: 'lime', primaryHex: PRIMARY_PALETTES.lime['500'] },
  { label: 'Material Blue', value: 'material-blue', preset: 'material', primary: 'blue', primaryHex: PRIMARY_PALETTES.blue['500'] },
  { label: 'Material Violet', value: 'material-violet', preset: 'material', primary: 'violet', primaryHex: PRIMARY_PALETTES.violet['500'] },
  { label: 'Material Teal', value: 'material-teal', preset: 'material', primary: 'teal', primaryHex: PRIMARY_PALETTES.teal['500'] },
  { label: 'Material Amber', value: 'material-amber', preset: 'material', primary: 'amber', primaryHex: PRIMARY_PALETTES.amber['500'] }
];

export function getThemeOptions(): ThemeOption[] {
  return [...THEME_OPTIONS];
}

export function getThemePrimaryHex(value: string): string {
  const found = THEME_OPTIONS.find((x) => x.value === value);
  return found?.primaryHex || '';
}
