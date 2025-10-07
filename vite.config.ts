import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: false,
    watch: {
      usePolling: true,
    },
  },
  preview: {
    host: '0.0.0.0', // Must match your CMD --host flag
    port: 3000, // Must match your CMD --port flag
    strictPort: true,
    allowedHosts: true
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
