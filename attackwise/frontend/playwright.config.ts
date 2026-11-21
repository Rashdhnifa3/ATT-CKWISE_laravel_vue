import { defineConfig } from '@playwright/test';

// The Vue build is served by `vite preview` on an explicit loopback address. A global setup
// verifies the served page is the Vue build (meta attackwise-frontend=vue), so a test run can
// never silently target the Angular reference.
export const VUE_URL = process.env.ATTACKWISE_VUE_URL || 'http://127.0.0.1:4174';

// These three reference specs drive the classic Navigator UI ("Create New Layer"), which the
// current reference never renders (DataTable is always [planning]="true"). They fail in the
// reference too (evidence: docs/migration/evidence/baseline). Run with --project=reference-legacy-ui.
const legacyUi = ['**/reference/layer.spec.ts', '**/reference/selection.spec.ts', '**/reference/layer-comparison.spec.ts'];

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: '**/*.spec.ts',
    outputDir: './tmp/playwright/test-results',
    workers: 1,
    retries: 0,
    globalSetup: './tests/e2e/global-setup.ts',
    use: { browserName: 'chromium', baseURL: VUE_URL, trace: 'retain-on-failure' },
    projects: [
        { name: 'vue', testIgnore: [...legacyUi, '**/compat/**', '**/release/**'] },
        { name: 'reference-legacy-ui', testMatch: legacyUi },
        // Angular ↔ Vue comparisons; these tests start/stop both apps themselves (needs the API on :8000).
        { name: 'compat', testMatch: '**/compat/**/*.spec.ts' },
        // Production release acceptance; needs ATTACKWISE_VUE_URL = the running release stack (no webServer).
        { name: 'release', testMatch: '**/release/**/*.spec.ts' },
    ],
    webServer: process.env.ATTACKWISE_VUE_URL
        ? undefined
        : {
              command: 'npx vite preview --host 127.0.0.1 --port 4174 --strictPort',
              url: VUE_URL,
              reuseExistingServer: false,
          },
});
