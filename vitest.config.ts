import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each database-backed file starts its own throwaway MongoDB; run files
    // one at a time to avoid concurrent binary downloads and mongod stampedes.
    fileParallelism: false,
    // A cold CI runner downloads the mongod binary inside the first hook.
    hookTimeout: 300_000,
  },
});
