import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-antd': ['antd', '@ant-design/icons'],
          'vendor-state': ['zustand', 'axios'],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    proxy: {
      // backup scheduler service (backup-scheduler/), see docs/BACKUP_SCHEDULER.md
      '/scheduler-api': {
        target: process.env.SCHEDULER_URL || 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/scheduler-api/, '/api/v1'),
      },
      // audit log viewer API (audit-proxy/)
      '/audit-api': {
        target: process.env.AUDIT_PROXY_URL || 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
      '/api': {
        // set AUDIT_PROXY_URL to record POST/PUT/PATCH/DELETE made from the dev server as well
        target: process.env.AUDIT_PROXY_URL || 'http://10.0.29.10:9999',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
