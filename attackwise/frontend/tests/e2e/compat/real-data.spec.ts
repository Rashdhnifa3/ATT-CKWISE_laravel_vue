// Real official data (Enterprise ATT&CK, latest release via the Laravel API / identical bytes for
// Angular) in both applications: same visible results, then repeated timings of matrix open,
// selection/scoring interaction and plan import. Metrics go to tmp/compat/metrics-real-data.json.
import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRONTEND, routeAngularOfficialData, startApp, stopApp, stubFonts, waitForMatrix, warmBundle, ensureApi, type Kind } from './apps';

const RUNS = Number(process.env.COMPAT_RUNS || 5);
const PORT = 4181;
test.setTimeout(20 * 60 * 1000);

async function oneRun(kind: Kind, url: string) {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await stubFonts(context);
    if (kind === 'angular') await routeAngularOfficialData(context);
    await context.addInitScript(() => localStorage.setItem('attackwise-language', 'en'));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const t0 = Date.now();
    await page.goto(url + '/');
    await waitForMatrix(page);
    const openMs = Date.now() - t0;
    const facts = await facts_(page);

    const t1 = Date.now();
    await page.getByRole('button', { name: /^T1566 Phishing/ }).click();
    await page.locator('#scenario-score').fill('7');
    await page.getByRole('button', { name: 'Save score', exact: true }).click();
    await expect(page.locator('.selected-pill')).toContainText('1');
    await page.getByRole('navigation', { name: 'Plan views' }).getByRole('button', { name: /Defensive Plan/ }).click();
    await expect(page.locator('.attack-list .status')).toHaveCount(1);
    const interactMs = Date.now() - t1;
    const defenseFacts = {
        resultsCount: await page.locator('.results-count').innerText(),
        attackMitigations: await page.locator('.mitigation[data-source=attack]').count(),
        d3fend: await page.locator('.mitigation.d3fend').count(),
    };
    await page.locator('.attack-list').getByRole('button', { name: /T1566/ }).click();
    const phishingDefenses = await page.locator('.mitigation').evaluateAll((els) => els.map((e) => e.querySelector('.mitigation-id')?.textContent?.trim()));
    await page.getByRole('navigation', { name: 'Plan views' }).getByRole('button', { name: /Final Plan/ }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download plan JSON', exact: true }).click();
    const file = (await (await download).path())!;

    const t2 = Date.now();
    await page.locator('#uploader').setInputFiles(file);
    await expect(page.locator('.workspace-tools select option')).toHaveCount(2);
    await expect(page.locator('.selected-pill')).toContainText('1');
    const importMs = Date.now() - t2;
    await browser.close();
    expect(errors).toEqual([]);
    return { openMs, interactMs, importMs, facts, defenseFacts, phishingDefenses };
}

async function facts_(page: Page) {
    return {
        version: await page.locator('.matrix-version').innerText(),
        tactics: await page.locator('.tactic-column h2').allInnerTexts(),
        counts: await page.locator('.tactic-heading > div > span').allInnerTexts(),
        firstColumn: await page.locator('.tactic-column').first().locator('.technique-id').allInnerTexts(),
    };
}

test('real Enterprise data: identical visible results and timing in Angular and Vue', async () => {
    await ensureApi();
    const minor = await warmBundle('enterprise-attack', '20');
    const results: Record<string, Awaited<ReturnType<typeof oneRun>>[]> = { angular: [], vue: [] };
    for (let i = 0; i < RUNS; i++) {
        for (const kind of ['angular', 'vue'] as Kind[]) {
            const server = await startApp(kind, PORT);
            try {
                results[kind].push(await oneRun(kind, server.url));
            } finally {
                await stopApp(server);
            }
        }
    }
    const a = results.angular[0], v = results.vue[0];
    expect(v.facts).toEqual(a.facts);
    expect(v.defenseFacts).toEqual(a.defenseFacts);
    expect(v.phishingDefenses).toEqual(a.phishingDefenses);
    expect(a.facts.version).toContain('v20');

    const stats = (xs: number[]) => {
        const s = [...xs].sort((p, q) => p - q);
        return { runs: xs, median: s[Math.floor(s.length / 2)], min: s[0], max: s[s.length - 1] };
    };
    const metrics = Object.fromEntries(
        (['angular', 'vue'] as Kind[]).map((k) => [
            k,
            { openMatrixMs: stats(results[k].map((r) => r.openMs)), interactMs: stats(results[k].map((r) => r.interactMs)), importMs: stats(results[k].map((r) => r.importMs)) },
        ])
    );
    const out = resolve(FRONTEND, 'tmp/compat');
    mkdirSync(out, { recursive: true });
    writeFileSync(
        resolve(out, 'metrics-real-data.json'),
        JSON.stringify({ dataset: `enterprise-attack ${minor}`, viewport: '1440x1000', runs: RUNS, browser: chromium.name(), facts: a.facts, defenseFacts: a.defenseFacts, metrics }, null, 2)
    );
    console.log(JSON.stringify(metrics));
});
