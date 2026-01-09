'use client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdkInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdkPromise: Promise<any> | null = null;

// This module handles Farcaster SDK loading safely on client-side only
export function getFarcasterSDK() {
  // Never load on server
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  // Return existing instance or promise
  if (sdkInstance) {
    return Promise.resolve(sdkInstance);
  }

  if (sdkPromise) {
    return sdkPromise;
  }

  // Create new loading promise
  sdkPromise = (async () => {
    try {
      const module = await import('@farcaster/miniapp-sdk');
      sdkInstance = module.sdk;
      return sdkInstance;
    } catch (error) {
      console.log('Failed to load Farcaster SDK:', error);
      return null;
    }
  })();

  return sdkPromise;
}

export async function initFarcasterMiniApp() {
  // Only run on client
  if (typeof window === 'undefined') {
    return { isInMiniApp: false, user: null };
  }

  const sdk = await getFarcasterSDK();
  if (!sdk) return { isInMiniApp: false, user: null };

  try {
    const context = await sdk.context;
    if (context?.user) {
      sdk.actions.ready();
      return { isInMiniApp: true, user: context.user };
    }
  } catch {
    console.log('Running outside Base App context');
  }

  return { isInMiniApp: false, user: null };
}

export async function openWarpcastCompose(text: string) {
  // Only run on client
  if (typeof window === 'undefined') {
    return false;
  }

  const sdk = await getFarcasterSDK();
  if (!sdk) return false;

  try {
    await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`);
    return true;
  } catch {
    console.log('Failed to open Warpcast');
    return false;
  }
}
