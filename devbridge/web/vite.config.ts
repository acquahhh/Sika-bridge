import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server listens on loopback only. The agent allows this origin
// (http://localhost:5173 and http://127.0.0.1:5173) by default.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
});
