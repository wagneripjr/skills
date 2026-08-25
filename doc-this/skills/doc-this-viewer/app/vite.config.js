import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// base: './' → the SPA's own JS/CSS load relative to .doc-this/viewer/index.html.
// Doc files are fetched with absolute paths (/.doc-this-sdd/...) from the project root.
// Output goes to the committed assets/dist/ that launch.mjs ships at runtime.
export default defineConfig({
  plugins: [svelte()],
  base: './',
  build: {
    outDir: '../assets/dist',
    emptyOutDir: true,
  },
})
