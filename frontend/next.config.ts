import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@farcaster/miniapp-sdk'],
  turbopack: {
    resolveAlias: {
      // Stub out the Farcaster SDK on server-side
      '@farcaster/miniapp-sdk': {
        browser: '@farcaster/miniapp-sdk',
        node: './src/lib/farcaster-stub.ts',
      },
    },
  },
};

export default nextConfig;
