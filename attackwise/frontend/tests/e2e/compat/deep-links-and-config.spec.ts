// Configuration and URL paths that are reachable but not used by the default config, compared in
// both apps with synthetic data: #layerURL (repeated), #bundleURL/#version/#domain, default_layers,
// banner, #subtechniques=false, customDataURL in a file, leave-site prompt (and #leave_site_dialog=false),
// changelog dialog from the version footer.
import { test, expect, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRONTEND, REPO, startApp, stopApp, type Kind, type Server } from './apps';
import { matrixSDO, TA0000, T0000, T0000_000, M0000, configData } from '../../../../shared/fixtures/mock-data';

const OUT = resolve(FRONTEND, 'tmp/compat/deep-links');
test.setTimeout(15 * 60 * 1000);
const baseConfig = JSON.parse(readFileSync(resolve(REPO, 'nav-app/src/assets/config.json'), 'utf8'));
const objects = [
    { ...M0000, name: 'Network Defense' },
    { type: 'relationship', id: 'rm', relationship_type: 'mitigates', source_ref: M0000.id, target_ref: T0000.id },
    { ...matrixSDO, tactic_refs: [TA0000.id] },
    { ...TA0000, name: 'Reconnaissance' },
    { ...T0000, name: 'Active Scanning', external_references: [{ external_id: 'T1595' }] },
    { ...T0000_000, name: 'Scanning IP Blocks', external_references: [{ external_id: 'T1595.001' }] },
    { type: 'relationship', id: 'rs', relationship_type: 'subtechnique-of', source_ref: T0000_000.id, target_ref: T0000.id },
];
const layer = (name: string, extra: Record<string, unknown> = {}) => ({
    name,
    versions: { attack: '13', layer: '4.5' },
    domain: 'enterprise-attack',
    techniques: [{ techniqueID: 'T1595', tactic: TA0000.x_mitre_shortname, score: 3, comment: 'from ' + name }],
    attackwise: { planId: 'plan-' + name.replace(/\W/g, ''), view: 'attack', selectedTechniques: ['T1595^' + TA0000.x_mitre_shortname], planning: { attackScores: { T1595: 3 } } },
    ...extra,
});
const CUSTOM_BUNDLE = 'https://synthetic.example/custom-bundle.json';
// Any hash suppresses the auto-created first plan (reference ngAfterViewInit), so fragment-only
// scenarios also load a layer to get a matrix on screen.
const FIRST = 'layerURL=https%3A%2F%2Fsynthetic.example%2Flayers%2FFirst.json';
const BUNDLE = 'bundleURL=https%3A%2F%2Fsynthetic.example%2Fcustom-bundle.json&version=14&domain=Enterprise-Attack';
const DEFAULTS = { default_layers: { enabled: true, urls: ['https://synthetic.example/layers/Default%20one.json'] } };

async function open(browser: Browser, server: Server, hash: string, config: Record<string, unknown> = {}): Promise<{ page: Page; context: BrowserContext; alerts: string[] }> {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route('**/assets/config.json', (r) => r.fulfill({ json: { ...baseConfig, collection_index_url: '', versions: configData, ...config } }));
    await context.route(configData.entries[0].domains[0].data[0], (r) => r.fulfill({ json: { type: 'bundle', objects } }));
    await context.route(CUSTOM_BUNDLE, (r) => r.fulfill({ json: { type: 'bundle', objects: objects.map((o) => (o.type === 'attack-pattern' ? { ...o, name: (o as { name: string }).name + ' (custom)' } : o)) } }));
    await context.route('https://synthetic.example/layers/*.json', (r) => {
        const name = decodeURIComponent(r.request().url().split('/').pop()!.replace('.json', ''));
        return r.fulfill({ json: name === 'pair' ? [layer('Pair A'), layer('Pair B')] : layer(name) });
    });
    await context.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
    await context.addInitScript(() => localStorage.setItem('attackwise-language', 'en'));
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const alerts: string[] = [];
    page.on('dialog', async (d) => {
        alerts.push(d.type() + ': ' + d.message());
        await d.accept();
    });
    await page.goto(server.url + '/' + hash);
    return { page, context, alerts };
}

async function state(page: Page) {
    await page.waitForTimeout(1500);
    return {
        plans: await page.locator('.workspace-tools select option').allInnerTexts(),
        active: await page.locator('.workspace-tools > span').innerText().catch(() => null),
        home: await page.locator('.wise-home').count(),
        version: await page.locator('.matrix-version').innerText(),
        banner: await page.locator('.wise-banner').allInnerTexts(),
        techniques: await page.locator('.technique-select strong').allInnerTexts(),
        subtechniqueToggles: await page.locator('.card-options button[aria-expanded]').count(),
        selected: await page.locator('.selected-pill').allInnerTexts(),
        dialogs: (await page.getByRole('dialog').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()),
    };
}

test('deep links, default layers, banner, feature fragments, customDataURL, leave-site prompt and changelog match', async () => {
    mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const servers: Record<Kind, Server> = { angular: await startApp('angular', 4198), vue: await startApp('vue', 4199) };
    const scenarios: { name: string; hash: string; config?: Record<string, unknown>; file?: unknown }[] = [
        { name: 'repeated layerURL fragments', hash: '#layerURL=https%3A%2F%2Fsynthetic.example%2Flayers%2FFirst.json&layerURL=https%3A%2F%2Fsynthetic.example%2Flayers%2Fpair.json' },
        { name: 'layerURL that fails to load', hash: '#layerURL=https%3A%2F%2Fsynthetic.example%2Fmissing%2Fnope.json' },
        { name: 'bundleURL + version + domain', hash: '#bundleURL=https%3A%2F%2Fsynthetic.example%2Fcustom-bundle.json&version=14&domain=Enterprise-Attack' },
        { name: 'default_layers + banner', hash: '', config: { banner: 'Synthetic banner — لافتة', default_layers: { enabled: true, urls: ['https://synthetic.example/layers/Default%20one.json'] } } },
        { name: 'subtechniques=false fragment (with a layer)', hash: '#' + FIRST + '&subtechniques=false' },
        { name: 'subtechniques=false fragment alone', hash: '#subtechniques=false' },
        { name: 'priority: bundleURL beats layerURL', hash: '#' + FIRST + '&' + BUNDLE },
        { name: 'priority: layerURL beats default_layers', hash: '#' + FIRST, config: DEFAULTS },
        { name: 'priority: incomplete bundleURL (no domain) falls back to layerURL', hash: '#' + FIRST + '&bundleURL=https%3A%2F%2Fsynthetic.example%2Fcustom-bundle.json&version=14' },
        {
            // Start-up links never show the upgrade dialog (reference upgradeLayer(..., defaultLayers = true)):
            // a v13 layer opens on v13 although v14 is the newest configured version.
            name: 'outdated layer from a start-up link opens on its own version without the upgrade dialog',
            hash: '#' + FIRST,
            config: { versions: { enabled: true, entries: [{ name: 'ATT&CK v14', version: '14', domains: [{ name: 'Enterprise', identifier: 'enterprise-attack', data: [CUSTOM_BUNDLE] }] }, ...configData.entries] } },
        },
        { name: 'default_layers disabled', hash: '', config: { default_layers: { enabled: false, urls: DEFAULTS.default_layers.urls } } },
        { name: 'customDataURL in an imported file', hash: '', file: layer('Custom data layer', { customDataURL: CUSTOM_BUNDLE, versions: { attack: '15', layer: '4.5' } }) },
    ];
    const report: Record<string, unknown> = {};
    try {
        for (const s of scenarios) {
            const results: Record<string, unknown> = {};
            for (const kind of ['angular', 'vue'] as Kind[]) {
                const { page, context, alerts } = await open(browser, servers[kind], s.hash, s.config);
                if (s.file) {
                    await page.locator('.matrix-columns').waitFor();
                    const f = resolve(OUT, 'custom-data-layer.json');
                    writeFileSync(f, JSON.stringify(s.file));
                    await page.locator('#uploader').setInputFiles(f);
                }
                results[kind] = { ...(await state(page)), alerts };
                await context.close();
            }
            expect(results.vue, s.name).toEqual(results.angular);
            report[s.name] = results.angular;
        }

        // Leave-site prompt: enabled by config, disabled by #leave_site_dialog=false.
        const leave: Record<string, unknown> = {};
        for (const kind of ['angular', 'vue'] as Kind[]) {
            const out: string[] = [];
            for (const hash of ['', '#' + FIRST, '#' + FIRST + '&leave_site_dialog=false']) {
                const { page, context, alerts } = await open(browser, servers[kind], hash);
                await page.locator('.matrix-columns').waitFor();
                await page.locator('.technique-select').first().click(); // user activation is required for beforeunload
                await page.close({ runBeforeUnload: true });
                await new Promise((r) => setTimeout(r, 800));
                out.push(hash + ' → ' + (alerts.filter((a) => a.startsWith('beforeunload')).length ? 'prompt' : 'no prompt'));
                await context.close();
            }
            leave[kind] = out;
        }
        expect(leave.vue).toEqual(leave.angular);
        report['leave-site prompt'] = leave.angular;

        // Changelog dialog from the version footer.
        const changelog: Record<string, unknown> = {};
        for (const kind of ['angular', 'vue'] as Kind[]) {
            const { page, context } = await open(browser, servers[kind], '');
            await page.locator('.matrix-columns').waitFor();
            await page.getByRole('button', { name: /Navigator v5\.3\.2/ }).click();
            const dialog = page.getByRole('dialog');
            await expect(dialog).toContainText('Changelog');
            // The reference renders CHANGELOG.md headings as "5.3.2 - 21 April 2026" (h1) + sections (h2).
            await expect(dialog.getByRole('heading', { level: 1, name: /^5\.3\.2 - / })).toBeVisible();
            const headings = { versions: (await dialog.locator('h1').allInnerTexts()).slice(0, 8), sections: await dialog.locator('h2').count(), links: await dialog.locator('a[href]').count() };
            await dialog.getByRole('button', { name: 'close' }).click();
            await expect(dialog).toHaveCount(0);
            changelog[kind] = headings;
            await context.close();
        }
        expect(changelog.vue).toEqual(changelog.angular);
        report['changelog headings'] = changelog.angular;
    } finally {
        writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
        await browser.close();
        await stopApp(servers.angular);
        await stopApp(servers.vue);
    }
});
