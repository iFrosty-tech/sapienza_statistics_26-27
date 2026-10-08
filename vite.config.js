import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { discoverHomeworkPages, sitePlugin } from './src/build/site-plugin.js';

const root = dirname(fileURLToPath(import.meta.url));

// Build inputs: the homepage plus every homework/NN/index.html.
// Folders starting with "_" (e.g. homework/_template/) are served in dev only.
const input = {
  main: resolve(root, 'index.html'),
  ...Object.fromEntries(
    discoverHomeworkPages(root).map((page) => [`homework-${page.name}`, page.file]),
  ),
};

export default defineConfig({
  base: '/sapienza_statistics_26-27/',
  plugins: [sitePlugin({ root })],
  build: {
    rolldownOptions: { input },
  },
});
