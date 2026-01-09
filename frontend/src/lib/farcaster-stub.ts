// Server-side stub for Farcaster SDK - returns null for all operations
export const sdk = {
  context: Promise.resolve(null),
  actions: {
    ready: () => {},
    openUrl: () => Promise.resolve(),
  },
};
