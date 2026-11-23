/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: { env: Record<string, string | undefined> };

// GitHub Pages serves the site from /<repo-name>/; the deploy workflow sets BASE_PATH.
// Locally (npm run dev / build) the base stays at '/'.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
