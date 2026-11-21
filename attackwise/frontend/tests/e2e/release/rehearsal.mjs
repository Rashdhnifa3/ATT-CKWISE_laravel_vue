// Switch-over rehearsal on ONE origin with ONE browser profile and synthetic plan content:
//   node tests/e2e/release/rehearsal.mjs <phase> <url> <profile-dir> <out-json>
//   phase angular-create : Angular (current site) creates two plans with synthetic values
//   phase vue-edit       : Vue (release) must list both, opens one, edits it, reloads, checks
//   phase angular-check  : Angular again (rollback) must show both plans including Vue's edit
// The orchestrating shell script swaps the server behind <url> between phases.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [phase, url, profile, outFile] = process.argv.slice(2);
const A = 'Synthetic rehearsal plan A';
const B = 'Synthetic rehearsal plan B — خطة';
const out = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
const context = await chromium.launchPersistentContext(profile, { viewport: { width: 1440, height: 1000 } });
const page = context.pages()[0] ?? (await context.newPage());
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const app = async () => ((await page.locator('meta[name=attackwise-frontend]').count()) ? 'vue' : 'angular');
const savedPlans = async () => page.locator('.wise-saved-plans li .saved-plan-open strong').allInnerTexts();
async function home() {
    await page.goto(url + '/');
    await page.locator('.wise-home').waitFor();
}
async function openPlan(name) {
    await page.locator('.saved-plan-open').filter({ hasText: name }).click();
    await page.locator('.reference-nav').waitFor();
}
async function score(id, value) {
    const nav = page.getByRole('navigation', { name: 'Plan views' });
    await nav.getByRole('button', { name: /Attack Plan/ }).click();
    await page.locator('.matrix-columns .tactic-column').first().waitFor();
    const card = page.locator('.technique-card').filter({ has: page.locator('.technique-id', { hasText: new RegExp('^' + id + '$') }) }).first();
    const select = card.locator('.technique-select');
    // Selecting opens the score drawer; an already selected technique is deselected first.
    if ((await select.getAttribute('aria-pressed')) === 'true') await select.click();
    await select.click();
    await page.locator('#scenario-score').fill(String(value));
    await page.getByRole('button', { name: 'Save score', exact: true }).click();
}
async function stored() {
    return page.evaluate(() => JSON.parse(localStorage.getItem('attackwise-plans') || '[]').map((p) => {
        const d = JSON.parse(p.data);
        return { name: p.name, scores: d.attackwise?.planning?.attackScores ?? {} };
    }));
}

const result = { app: null, errors };
if (phase === 'angular-create') {
    await page.addInitScript(() => localStorage.setItem('attackwise-language', 'en'));
    await home();
    result.app = await app();
    for (const [name, id, value] of [[A, 'T1566', 7], [B, 'T1190', 4]]) {
        await page.locator('.wise-brand').click();
        await page.locator('#plan-name').fill(name);
        await page.getByRole('button', { name: 'Start Threat Assessment' }).click();
        await page.locator('.matrix-columns .tactic-column').first().waitFor();
        await score(id, value);
    }
    await page.waitForTimeout(500);
    result.stored = await stored();
} else if (phase === 'vue-edit') {
    await home();
    result.app = await app();
    result.listed = await savedPlans();
    await openPlan(A);
    await score('T1059', 9); // edit made by the new version
    await page.waitForTimeout(500);
    await page.reload();
    await page.locator('.wise-home').waitFor();
    result.listedAfterReload = await savedPlans();
    result.stored = await stored();
} else if (phase === 'angular-check') {
    await home();
    result.app = await app();
    result.listed = await savedPlans();
    await openPlan(A);
    await page.getByRole('navigation', { name: 'Plan views' }).getByRole('button', { name: /Attack Plan/ }).click();
    await page.locator('.matrix-columns .tactic-column').first().waitFor();
    result.pressed = await page.locator('.technique-card .technique-select[aria-pressed=true]').evaluateAll((els) => els.map((e) => e.closest('.technique-card').querySelector('.technique-id').textContent.trim()).sort());
    result.stored = await stored();
} else {
    throw new Error('unknown phase ' + phase);
}
await context.close();
out[phase] = result;
writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(phase, JSON.stringify(result));
if (errors.length) process.exit(1);
