// Old files → both apps → same edit → export; exports compared semantically; then each app's
// export is opened by the OTHER app and re-exported (Vue → Angular proves the reference reads the
// new output; Angular → Vue proves the reverse). Dialog/alert/snackbar texts are compared too.
import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRONTEND, REPO, routeAngularOfficialData, startApp, stopApp, stubFonts, waitForMatrix, warmBundle, ensureApi, type Kind, type Server } from './apps';

const FIX = resolve(REPO, 'attackwise/shared/fixtures/compat');
const OUT = resolve(FRONTEND, 'tmp/compat/roundtrip');
const PORTS: Record<Kind, number> = { angular: 4182, vue: 4183 };
test.setTimeout(15 * 60 * 1000);

interface Flow {
    exported: Record<string, unknown> | Record<string, unknown>[] | null;
    events: string[];
    planNames: string[];
}
type Choice = 'Yes' | 'No';

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalize(layer: any, generatedPlanId: boolean) {
    const copy = JSON.parse(JSON.stringify(layer));
    copy.techniques = [...(copy.techniques || [])].sort((a: any, b: any) => (a.techniqueID + '^' + a.tactic).localeCompare(b.techniqueID + '^' + b.tactic));
    if (copy.attackwise) {
        if (generatedPlanId) copy.attackwise.planId = '<generated>';
        copy.attackwise.selectedTechniques = [...copy.attackwise.selectedTechniques].sort();
        for (const c of copy.attackwise.planning?.customDefenses || []) if (/^custom-\d+-/.test(c.id)) c.id = '<generated>';
    }
    return copy;
}

async function importAndExport(page: Page, file: string, choices: Choice[], edit: boolean): Promise<Flow> {
    const events: string[] = [];
    page.on('dialog', async (d) => {
        events.push('alert: ' + d.message());
        await d.accept();
    });
    const before = await page.locator('.workspace-tools select option').count();
    await page.locator('#uploader').setInputFiles(file);
    // Dialogs (upgrade / version warning) and snackbars, in order.
    const dialog = page.getByRole('dialog');
    const snack = page.locator('.mat-mdc-snack-bar-container, .aw-snackbar');
    let choiceIndex = 0;
    for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(400);
        if (await dialog.count()) {
            const text = (await dialog.first().innerText()).replace(/\s+/g, ' ').trim();
            events.push('dialog: ' + text);
            const choice = choices[choiceIndex] ?? 'No';
            const button = (await dialog.first().getByRole('button', { name: choice, exact: true }).count())
                ? dialog.first().getByRole('button', { name: choice, exact: true })
                : dialog.first().getByRole('button', { name: 'Dismiss', exact: true });
            if ((await dialog.first().getByRole('button', { name: choice, exact: true }).count()) > 0) choiceIndex++;
            await button.click();
            continue;
        }
        if ((await snack.count()) && !events.some((e) => e.startsWith('snackbar'))) events.push('snackbar: ' + (await snack.first().innerText()).replace(/\s+/g, ' ').trim());
    }
    await page.waitForTimeout(500);
    const planNames = await page.locator('.workspace-tools select option').allInnerTexts();
    if (!edit || planNames.length === before) return { exported: null, events, planNames };
    const nav = page.getByRole('navigation', { name: 'Plan views' });
    await nav.getByRole('button', { name: /Attack Plan/ }).click();
    await waitForMatrix(page);
    const target = page.getByRole('button', { name: /^T1190 Exploit Public-Facing Application/ });
    if ((await target.getAttribute('aria-pressed')) !== 'true') {
        await target.click();
        await page.locator('#scenario-score').fill('4');
        await page.getByRole('button', { name: 'Save score', exact: true }).click();
    }
    await nav.getByRole('button', { name: /Final Plan/ }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download plan JSON', exact: true }).click();
    const exported = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
    return { exported, events, planNames };
}

async function flow(kind: Kind, server: Server, file: string, choices: Choice[] = [], edit = true): Promise<Flow> {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await stubFonts(context);
    if (kind === 'angular') await routeAngularOfficialData(context);
    await context.addInitScript(() => localStorage.setItem('attackwise-language', 'en'));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(server.url + '/');
    await waitForMatrix(page);
    try {
        const result = await importAndExport(page, file, choices, edit);
        result.events.push(...errors.map((e) => 'pageerror: ' + e));
        return result;
    } finally {
        await browser.close();
    }
}

const cases: { file: string; choices?: Choice[]; edit?: boolean; generatedPlanId: boolean }[] = [
    { file: 'layer-v4.5-annotated.json', generatedPlanId: true },
    { file: 'layer-v4.3-minor.json', generatedPlanId: true },
    { file: 'layer-v3-legacy.json', generatedPlanId: true },
    { file: 'layer-v3-legacy-enterprise.json', generatedPlanId: true },
    { file: 'layers-array.json', generatedPlanId: true },
    { file: 'layer-attack-v19.json', choices: ['No'], generatedPlanId: false },
    { file: 'layer-attack-v19.json', choices: ['Yes'], generatedPlanId: false },
    { file: 'plan-legacy-ratings.json', generatedPlanId: false },
    { file: 'layer-mobile.json', edit: false, generatedPlanId: true },
    { file: 'malformed.json', edit: false, generatedPlanId: true },
];

test('old layers and plans: same result in both apps, and each app opens the other app’s export', async () => {
    await ensureApi();
    await warmBundle('enterprise-attack', '20');
    await warmBundle('enterprise-attack', '19');
    mkdirSync(OUT, { recursive: true });
    const angular = await startApp('angular', PORTS.angular);
    const vue = await startApp('vue', PORTS.vue);
    const report: unknown[] = [];
    try {
        const only = process.env.COMPAT_CASES?.split(',');
        for (const c of cases.filter((x) => !only || only.includes(x.file))) {
            const label = c.file + (c.choices ? ' [' + c.choices.join(',') + ']' : '');
            const path = resolve(FIX, c.file);
            console.log('case', label, 'angular');
            const a = await flow('angular', angular, path, c.choices, c.edit ?? true);
            console.log('case', label, 'vue');
            const v = await flow('vue', vue, path, c.choices, c.edit ?? true);
            const tag = c.file.replace('.json', '') + (c.choices ? '-' + c.choices.join('') : '');
            writeFileSync(resolve(OUT, tag + '.angular.json'), JSON.stringify(a.exported, null, 2));
            writeFileSync(resolve(OUT, tag + '.vue.json'), JSON.stringify(v.exported, null, 2));
            expect(v.events, label + ' events').toEqual(a.events);
            expect(v.planNames, label + ' plan list').toEqual(a.planNames);
            expect(v.exported === null, label).toBe(a.exported === null);
            const entry: Record<string, unknown> = { case: label, events: a.events, planNames: a.planNames, sameExport: false, vueToAngular: null, angularToVue: null };
            if (a.exported && v.exported) {
                expect(normalize(v.exported, c.generatedPlanId), label + ' export').toEqual(normalize(a.exported, c.generatedPlanId));
                entry.sameExport = true;
                // Vue export → Angular (rollback path) → re-export must equal the Vue export.
                const vueFile = resolve(OUT, tag + '.vue.json');
                console.log('case', label, 'vue export -> angular');
                const back = await flow('angular', angular, vueFile, ['No'], true);
                expect(back.events.filter((e) => e.startsWith('pageerror') || e.startsWith('alert')), label + ' angular reopen').toEqual([]);
                expect(normalize(back.exported, false), label + ' angular reopen export').toEqual(normalize(v.exported, false));
                entry.vueToAngular = 'equal';
                const angularFile = resolve(OUT, tag + '.angular.json');
                console.log('case', label, 'angular export -> vue');
                const fwd = await flow('vue', vue, angularFile, ['No'], true);
                expect(normalize(fwd.exported, false), label + ' vue reopen export').toEqual(normalize(a.exported, false));
                entry.angularToVue = 'equal';
            }
            report.push(entry);
        }
    } finally {
        writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
        await stopApp(angular);
        await stopApp(vue);
    }
});
