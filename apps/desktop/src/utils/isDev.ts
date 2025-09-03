export const isDev =
  // bundled renderer but launched with NODE_ENV=development
  process.env.NODE_ENV === 'development';
