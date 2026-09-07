import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// base: './' → the SPA's own JS/CSS load relative to .doc-this/viewer/index.html.
// Doc files are fetched with absolute paths (/.doc-this-sdd/...) from the project root.
// Output goes to the committed assets/viewer/ that launch.mjs ships at runtime. The directory
// is deliberately NOT called dist/: tessl's packer drops any directory of that name, which
// would publish this skill with its build source and no runnable bundle.
export default defineConfig({
  plugins: [svelte()],
  base: './',
  build: {
    outDir: '../assets/viewer',
    emptyOutDir: true,
  },
})
