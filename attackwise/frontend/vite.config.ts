/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

// Static SPA. Plans, layers and import/export stay in the browser; only official
// ATT&CK index/bundle reads go to the Laravel API (see src/domain/config.ts).
// Local dev/preview: proxy the read-only API to Laravel so the app uses same-origin /api/v1,
// matching a production deployment behind one host. Override with ATTACKWISE_API_PROXY.
const apiProxy = { '/api': { target: process.env.ATTACKWISE_API_PROXY || 'http://127.0.0.1:8000', changeOrigin: true } };

export default defineConfig({
    base: '/',
    plugins: [vue()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 2000 },
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: apiProxy },
    preview: { host: '127.0.0.1', port: 4174, strictPort: true, proxy: apiProxy },
    test: {
        environment: 'jsdom',
        include: ['tests/unit/**/*.spec.ts'],
        restoreMocks: true,
    },
});
