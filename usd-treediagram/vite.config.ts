import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset paths, so `dist/` can be served from any folder.
  base: './',
  server: {
    port: 5180,
    strictPort: false,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
})
