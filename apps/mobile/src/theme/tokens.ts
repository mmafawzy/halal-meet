/** Design tokens from spec 01 §0. */
export const palette = {
  navy900: '#0F1B2D',
  navy700: '#24344D',
  navy500: '#4A5A73',
  navy300: '#8D99AB',
  ivory50: '#FBF7F0',
  ivory100: '#F5EFE4',
  white: '#FFFFFF',
  emerald600: '#2F7A64',
  emerald500: '#3D8F77',
  emerald100: '#DCEDE6',
  emerald50: '#EEF6F2',
  gold500: '#C9A24B',
  gold300: '#E2C98E',
  gold100: '#F6EBD2',
  sand300: '#E6D9C3',
  sand200: '#EFE6D6',
  sand100: '#F6F0E6',
  amber500: '#D98E2B',
  amber100: '#FBEBD3',
  rose600: '#B4435A',
  rose100: '#F6DEE3',
  blue600: '#2E6DB4',
  purple600: '#7A4FB0',
} as const;

export const colors = {
  bg: palette.ivory50,
  bgElevated: palette.white,
  bgMuted: palette.sand100,
  card: palette.white,
  border: palette.sand300,
  borderSoft: palette.sand200,
  text: palette.navy900,
  textMuted: palette.navy500,
  textSubtle: palette.navy300,
  textOnDark: palette.ivory50,
  primary: palette.emerald600,
  primarySoft: palette.emerald100,
  primaryTint: palette.emerald50,
  premium: palette.gold500,
  premiumSoft: palette.gold100,
  discuss: palette.amber500,
  discussSoft: palette.amber100,
  danger: palette.rose600,
  dangerSoft: palette.rose100,
  navy: palette.navy900,
  overlay: 'rgba(15, 27, 45, 0.45)',
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 22, xxl: 28, pill: 999 } as const;

export const shadow = {
  card: {
    shadowColor: palette.navy900,
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  soft: {
    shadowColor: palette.navy900,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
} as const;

/** Soft avatar gradients (picked deterministically from the person's id). */
export const avatarGradients: Array<[string, string]> = [
  ['#DCEDE6', '#B9D9CC'],
  ['#F6EBD2', '#E8D3A3'],
  ['#E6E9F0', '#C7CEDD'],
  ['#F3E3E3', '#E2C3C8'],
  ['#E9E4F2', '#CFC5E3'],
  ['#E3EEF2', '#BFD8E1'],
];

export const MAX_CONTENT_WIDTH = 560;
