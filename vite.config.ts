import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0', // More explicit than 'true'
    port: 3000,
    open: true,
    strictPort: true,
    hmr: {
      host: 'screening.visionarytechsolution.com',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      src: '/src',
    },
  },
});
