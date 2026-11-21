// Word report content parity (document.xml text/tables, embedded chart, filename) in AR and EN with a
// fixed clock, and a network audit of the Vue app during import → edit → autosave → JSON/DOCX export.
import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRONTEND, REPO, routeAngularOfficialData, startApp, stopApp, stubFonts, waitForMatrix, warmBundle, ensureApi, type Kind, type Server } from './apps';

const OUT = resolve(FRONTEND, 'tmp/compat/exports');
test.setTimeout(15 * 60 * 1000);

async function buildState(page: Page) {
    await page.getByRole('button', { name: /^T1566 Phishing/ }).click();
    await page.locator('#scenario-score').fill('8');
    await page.getByRole('button', { name: 'Save score', exact: true }).click();
    await page.getByRole('button', { name: /^T1190 Exploit Public-Facing Application/ }).click();
    await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
    const nav = page.getByRole('navigation', { name: 'Plan views' });
    await nav.getByRole('button', { name: /Defensive Plan/ }).click();
    await page.locator('.attack-list').getByRole('button', { name: /T1566/ }).click();
    await page.locator('.mitigation[data-source=attack] .choose-defense').first().click();
    await page.locator('#scenario-score').fill('6');
    await page.getByRole('button', { name: 'Save score', exact: true }).click();
    await page.locator('.attack-list > button').first().click(); // "All mitigations" (T1566 has no D3FEND rows)
    await page.locator('.mitigation.d3fend .choose-defense').first().click();
    await page.locator('#scenario-score').fill('9');
    await page.getByRole('button', { name: 'Save score', exact: true }).click();
    await nav.getByRole('button', { name: /Final Plan/ }).click();
    await page.getByLabel('Risk formula', { exact: true }).selectOption('average');
}

async function wordReport(browser: Browser, kind: Kind, server: Server, lang: 'ar' | 'en') {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await stubFonts(context);
    if (kind === 'angular') await routeAngularOfficialData(context);
    await context.addInitScript(() => localStorage.setItem('attackwise-language', 'en'));
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    await page.clock.setFixedTime(new Date('2026-11-21T10:00:00Z'));
    await page.goto(server.url + '/');
    await waitForMatrix(page);
    await buildState(page); // scripted with English labels; Arabic is switched on just before export
    if (lang === 'ar') await page.getByRole('button', { name: 'Language', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.locator('.report-heading button.primary').click();
    const d = await download;
    const file = resolve(OUT, `report-${lang}.${kind}.docx`);
    await d.saveAs(file);
    const status = await page.locator('.report-page > p[role=status]').innerText();
    await context.close();
    const xml = execFileSync('unzip', ['-p', file, 'word/document.xml']).toString('utf8');
    const media = execFileSync('unzip', ['-Z1', file]).toString().split('\n').filter((n) => n.startsWith('word/media/'));
    const chart = media.length ? execFileSync('unzip', ['-p', file, media[0]]) : Buffer.alloc(0);
    const text = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    const tables = (xml.match(/<w:tbl>/g) || []).length;
    const rows = (xml.match(/<w:tr>/g) || []).length;
    return { filename: d.suggestedFilename(), status, text, tables, rows, rtl: xml.includes('<w:bidi'), chartBytes: chart.length, chart, xml };
}

test('Word report: same text, tables and chart in Angular and Vue (Arabic and English)', async () => {
    await ensureApi();
    await warmBundle('enterprise-attack', '20');
    mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const angular = await startApp('angular', 4192);
    const vue = await startApp('vue', 4193);
    const summary: Record<string, unknown> = {};
    try {
        for (const lang of ['en', 'ar'] as const) {
            const a = await wordReport(browser, 'angular', angular, lang);
            const v = await wordReport(browser, 'vue', vue, lang);
            expect(v.filename).toBe(a.filename);
            expect(v.status).toBe(a.status);
            expect(v.text).toEqual(a.text);
            expect(v.tables).toBe(a.tables);
            expect(v.rows).toBe(a.rows);
            expect(v.rtl).toBe(a.rtl);
            expect(v.chartBytes).toBeGreaterThan(1000);
            expect(v.chart.equals(a.chart), 'embedded chart PNG bytes').toBe(true);
            expect(v.xml).toBe(a.xml);
            summary[lang] = { filename: a.filename, paragraphsAndCells: a.text.length, tables: a.tables, rows: a.rows, rtl: a.rtl, chartBytes: a.chartBytes, documentXmlIdentical: true, sample: a.text.slice(0, 12) };
        }
    } finally {
        writeFileSync(resolve(OUT, 'docx-report.json'), JSON.stringify(summary, null, 2));
        await browser.close();
        await stopApp(angular);
        await stopApp(vue);
    }
});

test('Vue keeps plans and layers local: only same-origin GETs to static assets and the read-only ATT&CK API', async () => {
    await ensureApi();
    const vue = await startApp('vue', 4194);
    const browser = await chromium.launch();
    const MARKER = 'Synthetic-PRIVATE-marker-7f3a';
    const requests: { method: string; url: string; body: string | null }[] = [];
    try {
        const context = await browser.newContext({ acceptDownloads: true });
        await context.addInitScript(() => localStorage.setItem('attackwise-language', 'en'));
        const page = await context.newPage();
        page.setDefaultTimeout(60000);
        page.on('request', (r) => requests.push({ method: r.method(), url: r.url(), body: r.postData() }));
        await page.goto(vue.url + '/');
        await waitForMatrix(page);
        // Import a local layer containing user content, edit it, autosave, export JSON and Word.
        const layer = JSON.parse(readFileSync(resolve(REPO, 'attackwise/shared/fixtures/compat/layer-v4.5-annotated.json'), 'utf8'));
        layer.name = MARKER;
        layer.description = MARKER + ' description';
        const file = resolve(OUT, 'private-layer.json');
        mkdirSync(OUT, { recursive: true });
        writeFileSync(file, JSON.stringify(layer));
        await page.locator('#uploader').setInputFiles(file);
        await expect(page.locator('.workspace-tools > span')).toHaveText(MARKER);
        await page.getByRole('navigation', { name: 'Plan views' }).getByRole('button', { name: /Attack Plan/ }).click();
        await buildState(page);
        let d = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download plan JSON', exact: true }).click();
        expect(JSON.parse(readFileSync((await (await d).path())!, 'utf8')).name).toBe(MARKER);
        d = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Export Word report (.docx)', exact: true }).click();
        await d;
        await page.reload();
        await expect(page.locator('.wise-saved-plans li').filter({ hasText: MARKER })).toHaveCount(1);
        await context.close();
    } finally {
        await browser.close();
        await stopApp(vue);
    }
    const origin = new URL(vue.url).origin;
    const offending = requests.filter((r) => {
        const u = new URL(r.url);
        if (u.protocol === 'data:' || u.protocol === 'blob:') return false;
        if (r.method !== 'GET' || r.body) return true;
        if (u.origin !== origin) return true;
        if (u.pathname.startsWith('/api/') && !/^\/api\/v1\/attack\/(index|bundles\/[a-z0-9-]+\/\d+(\.\d+)?)$/.test(u.pathname)) return true;
        return r.url.includes(MARKER);
    });
    writeFileSync(resolve(OUT, 'network-audit.json'), JSON.stringify({ total: requests.length, api: requests.filter((r) => r.url.includes('/api/')).map((r) => r.method + ' ' + new URL(r.url).pathname), offending }, null, 2));
    expect(offending).toEqual([]);
    expect(requests.some((r) => r.url.includes('/api/v1/attack/bundles/enterprise-attack/'))).toBe(true);
});
