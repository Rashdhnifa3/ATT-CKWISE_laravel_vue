// TAXII sources (config `taxii_url` + `taxii_collection`) and Workbench-style authentication
// (config `versions.entries[].authentication`) compared in Angular and Vue against a LOCAL test
// service on loopback, with synthetic credentials. Records what each test server received, which
// browser requests carried an Authorization header, and whether the key ended up in localStorage.
// The real cti-taxii.mitre.org path (STIX 2.0) is exercised with a Playwright route, never the network.
import { test, expect, chromium, type Browser } from '@playwright/test';
import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRONTEND, REPO, startApp, stopApp, type Kind, type Server } from './apps';
import { matrixSDO, TA0000, T0000, T0000_000, M0000 } from '../../../../shared/fixtures/mock-data';

const OUT = resolve(FRONTEND, 'tmp/compat/taxii-auth');
test.setTimeout(20 * 60 * 1000);
const baseConfig = JSON.parse(readFileSync(resolve(REPO, 'nav-app/src/assets/config.json'), 'utf8'));
const DATA_PORT = 4205; // intended data origin
const OTHER_PORT = 4206; // a different origin (redirect target)
const DATA = `http://127.0.0.1:${DATA_PORT}`;
const OTHER = `http://127.0.0.1:${OTHER_PORT}`;
const SERVICE = 'synthetic-service';
const KEY = 'synthetic-key-0000-not-a-secret';
const GOOD = 'Basic ' + Buffer.from(`${SERVICE}:${KEY}`).toString('base64');

const objects = (label: string) => [
    { ...M0000, name: 'Network Defense' },
    { type: 'relationship', id: 'rm', relationship_type: 'mitigates', source_ref: M0000.id, target_ref: T0000.id },
    { ...matrixSDO, tactic_refs: [TA0000.id] },
    { ...TA0000, name: 'Reconnaissance' },
    { ...T0000, name: 'Active Scanning ' + label, external_references: [{ external_id: 'T1595' }] },
    { ...T0000_000, name: 'Scanning IP Blocks', external_references: [{ external_id: 'T1595.001' }] },
    { type: 'relationship', id: 'rs', relationship_type: 'subtechnique-of', source_ref: T0000_000.id, target_ref: T0000.id },
];

interface Hit {
    origin: string;
    method: string;
    path: string;
    authorization: string | null;
    accept: string | null;
    version: string | null;
}
const hits: Hit[] = [];

function testServer(port: number): Promise<HttpServer> {
    const origin = `http://127.0.0.1:${port}`;
    const server = createServer((req: IncomingMessage, res) => {
        const path = req.url || '/';
        hits.push({ origin, method: req.method!, path, authorization: req.headers.authorization ?? null, accept: req.headers.accept ?? null, version: (req.headers.version as string) ?? null });
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, version, accept', 'Access-Control-Allow-Methods': 'GET' };
        const json = (status: number, body: unknown) => {
            res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
            res.end(JSON.stringify(body));
        };
        if (req.method === 'OPTIONS') return res.writeHead(204, cors), res.end();
        if (port === DATA_PORT) {
            if (path === '/taxii/api/v21/collections/coll-1/objects/') return json(200, { more: false, objects: objects('(taxii)') });
            if (path === '/taxii-denied/api/v21/collections/coll-1/objects/') return json(401, { title: 'Unauthorized', http_status: '401' });
            if (path === '/taxii-slow/api/v21/collections/coll-1/objects/') return; // never answers → client timeout
            if (path === '/wb/enterprise.json') return req.headers.authorization === GOOD ? json(200, { type: 'bundle', objects: objects('(workbench)') }) : json(401, { message: 'Unauthorized' });
            if (path === '/wb-redirect/enterprise.json') {
                res.writeHead(302, { ...cors, Location: `${OTHER}/wb/enterprise.json` });
                return res.end();
            }
        }
        if (port === OTHER_PORT && path === '/wb/enterprise.json') return json(200, { type: 'bundle', objects: objects('(redirected)') });
        json(404, { message: 'not found' });
    });
    return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

const version = (domain: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    enabled: true,
    entries: [{ name: 'ATT&CK v13', version: '13', domains: [{ name: 'Enterprise', identifier: 'enterprise-attack', ...domain }], ...extra }],
});
const auth = (apiKey = KEY) => ({ authentication: { enabled: true, serviceName: SERVICE, apiKey } });

const scenarios: { name: string; versions: unknown; waitMs?: number }[] = [
    { name: 'TAXII 2.1 success (authentication configured but not applied to TAXII)', versions: version({ taxii_url: `${DATA}/taxii/`, taxii_collection: 'coll-1' }, auth()) },
    { name: 'TAXII 2.1 server answers 401', versions: version({ taxii_url: `${DATA}/taxii-denied/`, taxii_collection: 'coll-1' }) },
    { name: 'TAXII 2.1 server never answers (10 s client timeout)', versions: version({ taxii_url: `${DATA}/taxii-slow/`, taxii_collection: 'coll-1' }), waitMs: 13000 },
    { name: 'TAXII 2.0 legacy host (cti-taxii.mitre.org, routed locally)', versions: version({ taxii_url: 'https://cti-taxii.mitre.org/', taxii_collection: 'coll-1' }) },
    { name: 'authentication: correct key', versions: version({ data: [`${DATA}/wb/enterprise.json`] }, auth()) },
    { name: 'authentication: wrong key → 401', versions: version({ data: [`${DATA}/wb/enterprise.json`] }, auth('wrong-key')) },
    { name: 'authentication: data URL redirects to another origin', versions: version({ data: [`${DATA}/wb-redirect/enterprise.json`] }, auth()) },
];

async function run(browser: Browser, server: Server, versions: unknown, waitMs = 0) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route('**/assets/config.json', (r) => r.fulfill({ json: { ...baseConfig, collection_index_url: '', versions } }));
    await context.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
    const legacy: Hit[] = [];
    await context.route('https://cti-taxii.mitre.org/**', async (r) => {
        const h = await r.request().allHeaders();
        legacy.push({ origin: 'https://cti-taxii.mitre.org', method: r.request().method(), path: new URL(r.request().url()).pathname, authorization: h.authorization ?? null, accept: h.accept ?? null, version: h.version ?? null });
        return r.fulfill({ json: { objects: objects('(taxii 2.0)') }, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await context.addInitScript(() => localStorage.setItem('attackwise-language', 'en'));
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const withAuth: string[] = [];
    page.on('request', async (r) => {
        const h = await r.allHeaders().catch(() => ({}) as Record<string, string>);
        if (h.authorization) withAuth.push(`${r.method()} ${r.url()} → ${h.authorization === GOOD ? 'synthetic key' : h.authorization}`);
    });
    const alerts: string[] = [];
    page.on('dialog', async (d) => {
        alerts.push(d.type() + ': ' + d.message());
        await d.accept();
    });
    hits.length = 0;
    await page.goto(server.url + '/');
    await page.waitForTimeout(2500 + waitMs);
    const state = {
        plans: await page.locator('.workspace-tools select option').allInnerTexts(),
        home: await page.locator('.wise-home').count(),
        version: await page.locator('.matrix-version').innerText().catch(() => null),
        techniques: await page.locator('.technique-select strong').allInnerTexts(),
        planError: await page.locator('#plan-error').innerText().catch(() => null),
        alerts,
        serverHits: hits.filter((h) => h.method !== 'OPTIONS').map((h) => ({ ...h, authorization: h.authorization === GOOD ? 'synthetic key' : h.authorization })),
        legacyTaxiiHits: legacy,
        browserRequestsWithAuthorization: [...new Set(withAuth)].sort(),
        keyInLocalStorage: await page.evaluate((k) => JSON.stringify({ ...localStorage }).includes(k), KEY),
    };
    await context.close();
    return state;
}

test('TAXII and authenticated sources: same requests, headers, results and errors in Angular and Vue', async () => {
    mkdirSync(OUT, { recursive: true });
    const data = await testServer(DATA_PORT);
    const other = await testServer(OTHER_PORT);
    const browser = await chromium.launch();
    const servers: Record<Kind, Server> = { angular: await startApp('angular', 4207), vue: await startApp('vue', 4208) };
    const report: Record<string, unknown> = {};
    const failures: string[] = [];
    try {
        for (const s of scenarios) {
            const a = await run(browser, servers.angular, s.versions, s.waitMs);
            const v = await run(browser, servers.vue, s.versions, s.waitMs);
            // Same-origin requests differ only by the app port; normalise before comparing.
            const norm = (x: typeof a) => JSON.parse(JSON.stringify(x).replaceAll(servers.angular.url, '<app>').replaceAll(servers.vue.url, '<app>'));
            report[s.name] = { angular: norm(a), vue: norm(v), equal: JSON.stringify(norm(a)) === JSON.stringify(norm(v)) };
            if (JSON.stringify(norm(a)) !== JSON.stringify(norm(v))) failures.push(s.name);
            // Credentials: never sent anywhere but the configured data URLs of that version, never stored.
            for (const [kind, st] of [['angular', a], ['vue', v]] as const) {
                const leaks = st.browserRequestsWithAuthorization.filter((x) => x.includes('synthetic key') && !x.includes(`${DATA}/wb`));
                if (leaks.length) failures.push(`${kind} ${s.name}: key sent to ${leaks.join(', ')}`);
                if (st.serverHits.some((h) => h.origin === OTHER && h.authorization)) failures.push(`${kind} ${s.name}: Authorization forwarded across the redirect`);
                if (st.keyInLocalStorage) failures.push(`${kind} ${s.name}: key written to localStorage`);
            }
        }
    } finally {
        writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
        await browser.close();
        await stopApp(servers.angular);
        await stopApp(servers.vue);
        data.close();
        other.close();
    }
    expect(failures).toEqual([]);
});
