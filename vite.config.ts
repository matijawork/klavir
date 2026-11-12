import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/klavir/',
  plugins: [preact()],
  build: { target: 'es2023', sourcemap: true },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
