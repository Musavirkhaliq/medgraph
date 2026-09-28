import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../src/medgraph/api/static'),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/sessions': 'http://127.0.0.1:8000',
      '/auth': 'http://127.0.0.1:8000',
      '/admin': 'http://127.0.0.1:8000',
      '/patients': 'http://127.0.0.1:8000',
      '/memory': 'http://127.0.0.1:8000',
      '/api': 'http://127.0.0.1:8000',
      '/voice': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
      '/graph-diagram': 'http://127.0.0.1:8000',
    },
  },
});
