import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/utils/rate-limiter.ts',
    'src/utils/security.ts',
    'src/utils/logger.ts',
    'src/utils/metrics.ts',
    'src/utils/health.ts',
    'src/utils/graceful-shutdown.ts',
    'src/utils/error-recovery.ts',
    'src/utils/database.ts'
  ],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  minify: false,
  splitting: false,
  treeshake: true,
  outDir: 'dist',
});
