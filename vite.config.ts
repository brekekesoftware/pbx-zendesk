import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  build: {
    rollupOptions: {
      input: {
        index: './assets/index.html',
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    {
      name: 'html:zendesk-assets-link',
      apply: 'build',
      enforce: 'post',
      // replace '../assets' with '.' in linked files so that zendesk can find the assets.
      // transformIndexHtml: html => html.replace('../assets', '.'),
      transformIndexHtml: html => html.replace(/(?<=(src|href)=".*?)\.\.\/assets/g, '.'),
    },
  ],
});
