// Same palette as the web app: high contrast for use outdoors in sun.
export const colors = {
  paper: '#FFFAF3',
  sand: '#F3E8D8',
  ink: '#1A1410',
  inkSoft: '#5B5048',
  chile: '#B42318',
  chileDark: '#8C1C13',
  live: '#157F3C',
  marigold: '#F5A524',
  white: '#FFFFFF',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

// Big type and touch targets (minimum 56 pt) for people using the app
// on the street, often one-handed.
export const type = {
  title: 32,
  heading: 24,
  body: 18,
  small: 15,
} as const;

export const touch = { min: 56 } as const;
