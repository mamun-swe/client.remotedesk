import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    open: true,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      src: '/src',
    },
  },
  preview: {
    allowedHosts: ['screening.visionarytechsolution.com'],
    host: true,
    port: 3000,
  },
});
