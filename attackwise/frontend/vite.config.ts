/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

// Static SPA. Plans, layers and import/export stay in the browser; only official
// ATT&CK index/bundle reads go to the Laravel API (see src/domain/config.ts).
export default defineConfig({
    base: '/',
    plugins: [vue()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 2000 },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '127.0.0.1', port: 4174, strictPort: true },
    test: {
        environment: 'jsdom',
        include: ['tests/unit/**/*.spec.ts'],
        restoreMocks: true,
    },
});
