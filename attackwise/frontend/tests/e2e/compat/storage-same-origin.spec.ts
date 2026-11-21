// VERIFY.md storage order on ONE origin (http://127.0.0.1:4196) and ONE temporary browser profile:
// Angular creates two plans → Vue served on the same origin restores both, edits one, reloads →
// Angular served again on the same origin sees the expected data. Plus legacy draft, corrupt entry,
// write failure and the different-port caveat. Synthetic data only.
import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FRONTEND, routeAngularOfficialData, startApp, stopApp, stubFonts, waitForMatrix, warmBundle, ensureApi, type Kind, type Server } from './apps';

const PORT = 4196; // note: 4190 is a Fetch-spec blocked port (sieve)
const OTHER_PORT = 4197;
test.setTimeout(15 * 60 * 1000);

/* eslint-disable @typescript-eslint/no-explicit-any */
const plans = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('attackwise-plans') || 'null'));
const planData = (list: any[], name: string) => JSON.parse(list.find((p) => p.name === name).data);

async function profile(): Promise<BrowserContext> {
    const dir = mkdtempSync(join(tmpdir(), 'attackwise-profile-'));
    const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: 1440, height: 1000 } });
    await stubFonts(ctx);
    await routeAngularOfficialData(ctx); // only matches Angular's GitHub URLs; Vue uses the API
    return ctx;
}

async function home(page: Page, server: Server) {
    await page.goto(server.url + '/');
    await page.evaluate(() => localStorage.setItem('attackwise-language', 'en'));
    await page.goto(server.url + '/');
}

async function selectAndScore(page: Page, technique: RegExp, score: string) {
    await page.getByRole('button', { name: technique }).click();
    await page.locator('#scenario-score').fill(score);
    await page.getByRole('button', { name: 'Save score', exact: true }).click();
}

async function resume(page: Page, name: string) {
    await page.locator('.wise-saved-plans li').filter({ hasText: name }).locator('.saved-plan-open').click();
    await expect(page.locator('.workspace-tools > span')).toHaveText(name);
}

test('plans move Angular → Vue → Angular on one origin; legacy draft, corrupt entry, write failure', async () => {
    await ensureApi();
    await warmBundle('enterprise-attack', '20');
    const log: Record<string, unknown> = {};
    const ctx = await profile();
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    let server: Server | undefined;
    const serve = async (kind: Kind) => {
        await stopApp(server);
        console.log('serve', kind, new Date().toISOString());
        server = await startApp(kind, PORT);
        return server;
    };
    try {
        // 1) Angular: two plans with synthetic values.
        console.log('step', '1) Angular: two plans with synthetic values.');
        await home(page, await serve('angular'));
        await waitForMatrix(page);
        await selectAndScore(page, /^T1566 Phishing/, '7');
        await page.getByRole('navigation', { name: 'Plan views' }).getByRole('button', { name: /Defensive Plan/ }).click();
        await page.getByRole('button', { name: 'New plan' }).click();
        await page.locator('#plan-name').fill('Synthetic second plan');
        await page.getByRole('button', { name: 'Start Threat Assessment' }).click();
        await waitForMatrix(page);
        await selectAndScore(page, /^T1059 Command and Scripting Interpreter/, '3');
        const angularPlans = await plans(page);
        expect(angularPlans).toHaveLength(2);
        log.angularCreated = angularPlans.map((p: any) => p.name);

        // 2) Vue on the SAME origin restores both plans, edits one, reloads.
        console.log('step', '2) Vue on the SAME origin restores both plans, edits one, reloads.');
        await home(page, await serve('vue'));
        await expect(page.locator('meta[name=attackwise-frontend]')).toHaveAttribute('content', 'vue');
        await expect(page.locator('.wise-saved-plans li')).toHaveCount(2);
        await resume(page, 'Enterprise Threat Plan');
        await expect(page.getByRole('navigation', { name: 'Plan views' }).getByRole('button', { name: /Defensive Plan/ })).toHaveAttribute('aria-current', 'step');
        await expect(page.locator('.selected-pill')).toContainText('1');
        await page.getByRole('button', { name: 'New plan' }).click();
        await resume(page, 'Synthetic second plan');
        await waitForMatrix(page);
        await expect(page.locator('.technique-card[data-risk=low]').filter({ hasText: 'T1059' })).toHaveCount(1);
        await selectAndScore(page, /^T1190 Exploit Public-Facing Application/, '5');
        await page.reload();
        await expect(page.locator('.wise-saved-plans li')).toHaveCount(2);
        const vuePlans = await plans(page);
        expect(planData(vuePlans, 'Synthetic second plan').attackwise.planning.attackScores).toEqual({ T1059: 3, T1190: 5 });
        expect(planData(vuePlans, 'Enterprise Threat Plan').attackwise.planning.attackScores).toEqual({ T1566: 7 });
        expect(vuePlans.map((p: any) => p.id).sort()).toEqual(angularPlans.map((p: any) => p.id).sort());
        log.vueRestoredAndEdited = true;

        // 3) Roll back: Angular on the same origin sees both plans including Vue's edit.
        console.log('step', "3) Roll back: Angular on the same origin sees both plans including Vue's edit.");
        await home(page, await serve('angular'));
        await expect(page.locator('.wise-saved-plans li')).toHaveCount(2);
        await resume(page, 'Synthetic second plan');
        await waitForMatrix(page);
        await expect(page.locator('.selected-pill')).toContainText('2');
        await expect(page.locator('.technique-card[data-risk=medium]').filter({ hasText: 'T1190' })).toHaveCount(1);
        await page.getByRole('navigation', { name: 'Plan views' }).getByRole('button', { name: /Final Plan/ }).click();
        await expect(page.locator('.report-table tbody tr')).toHaveCount(2);
        log.angularAfterRollback = 'both plans and the Vue edit are readable';

        // 4) Legacy draft (attackwise-draft) is migrated by Vue exactly like Angular.
        console.log('step', '4) Legacy draft (attackwise-draft) is migrated by Vue exactly like Angular.');
        const legacy = JSON.parse(planData(await plans(page), 'Enterprise Threat Plan') ? JSON.stringify(planData(await plans(page), 'Enterprise Threat Plan')) : '{}');
        legacy.name = 'Synthetic legacy draft';
        delete legacy.attackwise.planId;
        const draftResults: Record<string, unknown> = {};
        for (const kind of ['angular', 'vue'] as Kind[]) {
            await home(page, await serve(kind));
            await page.evaluate((d) => {
                localStorage.setItem('attackwise-plans', '[]');
                localStorage.setItem('attackwise-draft', d);
            }, JSON.stringify(legacy));
            await page.reload();
            await expect(page.locator('.wise-saved-plans li').filter({ hasText: 'Synthetic legacy draft' })).toHaveCount(1);
            draftResults[kind] = await page.evaluate(() => ({
                draftKey: localStorage.getItem('attackwise-draft'),
                names: JSON.parse(localStorage.getItem('attackwise-plans') || '[]').map((p: any) => p.name),
                planIdSet: JSON.parse(JSON.parse(localStorage.getItem('attackwise-plans') || '[]')[0].data).attackwise.planId.startsWith('plan-'),
            }));
        }
        expect(draftResults.vue).toEqual(draftResults.angular);
        log.legacyDraft = draftResults;

        // 5) Corrupt attackwise-plans: Angular overwrites it on the next save; Vue keeps a backup first.
        console.log('step', '5) Corrupt attackwise-plans: Angular overwrites it on the next save; Vue keeps a backup first.');
        const corrupt: Record<string, unknown> = {};
        for (const kind of ['angular', 'vue'] as Kind[]) {
            await home(page, await serve(kind));
            await page.evaluate(() => {
                localStorage.removeItem('attackwise-plans-unreadable-backup');
                localStorage.setItem('attackwise-plans', '{"synthetic": corrupt');
            });
            await page.reload();
            await waitForMatrix(page); // nothing readable → first plan is auto-created and saved
            corrupt[kind] = await page.evaluate(() => ({
                plans: JSON.parse(localStorage.getItem('attackwise-plans') || 'null')?.map((p: any) => p.name),
                backup: localStorage.getItem('attackwise-plans-unreadable-backup'),
            }));
        }
        expect(corrupt.angular).toEqual({ plans: ['Enterprise Threat Plan'], backup: null });
        expect(corrupt.vue).toEqual({ plans: ['Enterprise Threat Plan'], backup: '{"synthetic": corrupt' });
        log.corruptEntry = corrupt;

        // 6) Write failure: same visible message in both apps.
        console.log('step', '6) Write failure: same visible message in both apps.');
        const writeFailure: Record<string, string> = {};
        for (const kind of ['angular', 'vue'] as Kind[]) {
            const srv = await serve(kind);
            const isolated = await chromium.launch();
            const c = await isolated.newContext({ viewport: { width: 1440, height: 1000 } });
            await stubFonts(c);
            await routeAngularOfficialData(c);
            await c.addInitScript(() => {
                const set = Storage.prototype.setItem;
                if (!localStorage.getItem('attackwise-language')) set.call(localStorage, 'attackwise-language', 'en');
                Storage.prototype.setItem = function () {
                    throw new DOMException('Synthetic quota exceeded', 'QuotaExceededError');
                };
            });
            const p = await c.newPage();
            p.setDefaultTimeout(120000);
            await p.goto(srv.url + '/');
            await waitForMatrix(p); // nothing stored → the first plan is auto-created (its save fails silently)
            await selectAndScore(p, /^T1566 Phishing/, '1');
            writeFailure[kind] = await p.locator('.draft-status').innerText();
            await isolated.close();
        }
        expect(writeFailure.vue).toEqual(writeFailure.angular);
        expect(writeFailure.vue).toBe('Browser storage unavailable. Download your plan to keep it.');
        log.writeFailure = writeFailure;
    } finally {
        await stopApp(server);
        await ctx.close();
    }

    // 7) Different port = different origin: Vue on :4197 does not see :4196's plans.
    const other = await startApp('vue', OTHER_PORT);
    const ctx2 = await chromium.launch();
    try {
        const p2 = await (await ctx2.newContext()).newPage();
        await p2.goto(other.url + '/');
        expect(await p2.evaluate(() => localStorage.getItem('attackwise-plans'))).toBeNull();
        log.differentPort = 'no plans visible on a different port (separate localStorage origin)';
    } finally {
        await ctx2.close();
        await stopApp(other);
    }
    expect(errors).toEqual([]);
    const out = resolve(FRONTEND, 'tmp/compat');
    mkdirSync(out, { recursive: true });
    writeFileSync(resolve(out, 'storage-same-origin.json'), JSON.stringify(log, null, 2));
});
