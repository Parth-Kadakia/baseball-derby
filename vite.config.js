import { defineConfig } from 'vite';

export default defineConfig({
  // Static assets (sounds, spritsheets, slices) live in /public and are served
  // at the site root in dev and copied into the build output for production.
  publicDir: 'public',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: true,
  },
});
