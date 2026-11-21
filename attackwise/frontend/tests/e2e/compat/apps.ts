// Helpers for Angular ↔ Vue compatibility tests. Both apps are served on loopback only.
// Angular (reference) is served from nav-app/dist/browser by python http.server, exactly like the
// reference Playwright config; Vue is served by `vite preview` (which proxies /api to Laravel).
// Angular's official-data requests to GitHub are fulfilled from the Laravel API cache files, so
// both applications parse the SAME bytes of the SAME ATT&CK release.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';

export const FRONTEND = resolve(__dirname, '../../..');
export const REPO = resolve(FRONTEND, '../..');
export const ANGULAR_DIST = resolve(REPO, 'nav-app/dist/browser');
export const BACKEND = resolve(REPO, 'attackwise/backend');
export const API = process.env.ATTACKWISE_API_URL || 'http://127.0.0.1:8000';
export const CACHE_DIR = process.env.ATTACKWISE_CACHE_DIR || resolve(BACKEND, 'storage/app/attack-cache');
export type Kind = 'angular' | 'vue';

export interface Server {
    kind: Kind;
    port: number;
    url: string;
    proc: ChildProcess;
}

async function waitFor(url: string, timeoutMs = 30000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
            if (r.ok) return;
        } catch {
            /* not up yet */
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('Timed out waiting for ' + url);
}

export async function startApp(kind: Kind, port: number): Promise<Server> {
    if (kind === 'angular' && !existsSync(resolve(ANGULAR_DIST, 'index.html'))) throw new Error('Build the reference first: (cd nav-app && npm run build)');
    if (kind === 'vue' && !existsSync(resolve(FRONTEND, 'dist/index.html'))) throw new Error('Build the Vue app first: (cd attackwise/frontend && npm run build)');
    const proc =
        kind === 'angular'
            ? spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ANGULAR_DIST], { stdio: ['ignore', 'ignore', 'pipe'] })
            : spawn(process.execPath, [resolve(FRONTEND, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
                  cwd: FRONTEND,
                  stdio: ['ignore', 'ignore', 'pipe'],
              });
    let stderr = '';
    proc.stderr?.on('data', (d) => (stderr = (stderr + d).slice(-2000)));
    const url = `http://127.0.0.1:${port}`;
    try {
        await waitFor(url + '/');
    } catch (e) {
        proc.kill('SIGTERM');
        throw new Error(`${kind} server did not start on ${url} (exit=${proc.exitCode}): ${stderr}`);
    }
    const html = await (await fetch(url + '/', { signal: AbortSignal.timeout(5000) })).text();
    const isVue = html.includes('data-attackwise-app="vue"');
    if ((kind === 'vue') !== isVue) throw new Error(`${url} is not serving the ${kind} build`);
    return { kind, port, url, proc };
}

export async function stopApp(server: Server | undefined) {
    if (!server) return;
    const exited = new Promise((r) => server.proc.once('exit', r));
    server.proc.kill('SIGTERM');
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
    // Wait until the port is free so the other app can reuse the same origin.
    for (let i = 0; i < 50; i++) {
        try {
            await fetch(server.url + '/', { signal: AbortSignal.timeout(1000) });
            await new Promise((r) => setTimeout(r, 100));
        } catch {
            return;
        }
    }
}

/** Ensures the Laravel API is up (tests do not start it; see docs/migration/RUNNING.md). */
export async function ensureApi() {
    const r = await fetch(API + '/api/v1/health').catch(() => null);
    if (!r?.ok) throw new Error(`Laravel API not reachable at ${API}. Start it: (cd attackwise/backend && php artisan serve --host=127.0.0.1 --port=8000)`);
}

/** Fetches a bundle through the API so the cache file exists; returns the resolved minor version. */
export async function warmBundle(domain: string, major: string): Promise<string> {
    const r = await fetch(`${API}/api/v1/attack/bundles/${domain}/${major}`);
    if (!r.ok) throw new Error(`API bundle ${domain}/${major} → HTTP ${r.status}`);
    await r.arrayBuffer();
    return r.headers.get('x-attack-version') || major;
}

/** Serve Angular's GitHub data requests from the API cache (identical bytes, no network). */
export async function routeAngularOfficialData(target: Page | BrowserContext) {
    await ensureApi();
    const index = (await (await fetch(`${API}/api/v1/attack/index`)).json()) as { data: unknown };
    await target.route('https://raw.githubusercontent.com/mitre-attack/attack-stix-data/**', async (route) => {
        const url = route.request().url();
        if (url.endsWith('/index.json')) return route.fulfill({ json: index.data });
        const m = url.match(/\/([a-z-]+)\/\1-(\d+\.\d+)\.json$/);
        if (!m) return route.abort();
        const file = resolve(CACHE_DIR, 'bundles', m[1], m[2] + '.json');
        if (!existsSync(file)) await warmBundle(m[1], m[2]);
        return route.fulfill({ body: readFileSync(file), contentType: 'application/json' });
    });
}

export async function stubFonts(target: Page | BrowserContext) {
    await target.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '', contentType: 'text/css' }));
}

/** Waits until the planner is visible with data (attack matrix columns rendered). */
export async function waitForMatrix(page: Page) {
    await page.locator('.matrix-columns .tactic-column').first().waitFor({ timeout: 120000 });
}
