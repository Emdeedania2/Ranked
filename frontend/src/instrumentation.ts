export async function register() {
  // Only apply on server
  if (typeof window === 'undefined') {
    // Polyfill localStorage for SSR to prevent errors from libraries that expect it
    const storage = new Map<string, string>();

    (globalThis as any).localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() { return storage.size; },
    };
  }
}
