// Release acceptance on the PRODUCTION stack (Nginx + PHP-FPM containers), run against the public
// address of the stack: ATTACKWISE_VUE_URL=http://127.0.0.1:<port> npx playwright test --project=release
// Real Enterprise data via same-origin /api/v1. Records evidence in tmp/release/.
//  - user journey: open matrix, score, defend, reload + resume, JSON export → import, Word report
//  - print output (Chromium print → PDF) in English and Arabic for the Final Plan
//  - no CSP violations, no page errors, every request same-origin
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.ATTACKWISE_VUE_URL!;
const OUT = resolve(__dirname, '../../../tmp/release');
test.setTimeout(10 * 60 * 1000);
test.use({ baseURL: BASE, viewport: { width: 1440, height: 1000 }, acceptDownloads: true });

async function instrument(context: BrowserContext, page: Page) {
    const issues: string[] = [];
    const requests: string[] = [];
    await context.addInitScript(() => {
        (window as unknown as { __csp: string[] }).__csp = [];
        document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    });
    page.on('pageerror', (e) => issues.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') issues.push('console: ' + m.text()); });
    page.on('request', (r) => requests.push(r.method() + ' ' + r.url()));
    return { issues, requests };
}

async function scoreAndDefend(page: Page) {
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
    await nav.getByRole('button', { name: /Final Plan/ }).click();
    await page.getByLabel('Risk formula', { exact: true }).selectOption('average');
}

function pdfFacts(file: string) {
    const info = execFileSync('pdfinfo', [file]).toString();
    const text = execFileSync('pdftotext', ['-layout', file, '-']).toString();
    return { pages: Number(/Pages:\s+(\d+)/.exec(info)![1]), size: /Page size:\s+([^\n]+)/.exec(info)![1].trim(), text };
}

test('production stack: real-data journey, reload, JSON round trip, Word report, print, CSP, same-origin', async ({ page, context }) => {
    mkdirSync(OUT, { recursive: true });
    const { issues, requests } = await instrument(context, page);
    await context.addInitScript(() => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('attackwise-language', 'en');
            sessionStorage.setItem('seeded', '1');
        }
    });
    const log: Record<string, unknown> = {};
    const t0 = Date.now();
    await page.goto('/');
    await page.locator('.matrix-columns .tactic-column').first().waitFor({ timeout: 180000 });
    log.openMatrixMs = Date.now() - t0;
    log.version = await page.locator('.matrix-version').innerText();
    log.tactics = await page.locator('.tactic-column').count();
    expect(log.tactics).toBeGreaterThan(10);

    await scoreAndDefend(page);
    const planName = await page.locator('.workspace-tools > span').innerText();
    const before = { pill: await page.locator('.selected-pill').innerText(), result: await page.locator('.formula-result').allInnerTexts() };

    // Reload: the plan was autosaved; resume it from "Your saved plans".
    await page.reload();
    await page.locator('.wise-saved-plans').waitFor();
    await page.locator('.saved-plan-open').filter({ hasText: planName }).click();
    await page.locator('.report-table').waitFor();
    const after = { pill: await page.locator('.selected-pill').innerText(), result: await page.locator('.formula-result').allInnerTexts() };
    expect(after).toEqual(before);
    log.afterReload = after;

    // Edit after reload (a second defense score) so the saved plan changes, then export JSON.
    await page.getByLabel('Risk formula', { exact: true }).selectOption('strongest');
    let d = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download plan JSON', exact: true }).click();
    const exported = resolve(OUT, 'plan-export.json');
    await (await d).saveAs(exported);
    const exportedJson = JSON.parse(readFileSync(exported, 'utf8'));
    expect(exportedJson.name).toBe(planName);

    // Import the exported file: a second plan with the same content opens.
    await page.locator('#uploader').setInputFiles(exported);
    await expect(page.locator('.workspace-tools select option')).toHaveCount(2);
    d = page.waitForEvent('download');
    await page.getByRole('navigation', { name: 'Plan views' }).getByRole('button', { name: /Final Plan/ }).click();
    await page.getByRole('button', { name: 'Download plan JSON', exact: true }).click();
    const reexported = resolve(OUT, 'plan-reexport.json');
    await (await d).saveAs(reexported);
    const strip = (j: Record<string, any>) => ({ ...j, attackwise: { ...j.attackwise, planId: '<id>' } }); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(strip(JSON.parse(readFileSync(reexported, 'utf8')))).toEqual(strip(exportedJson));
    log.jsonRoundTrip = 'identical (ignoring planId)';

    // Word report in English and Arabic.
    for (const lang of ['en', 'ar'] as const) {
        if (lang === 'ar') await page.getByRole('button', { name: 'Language', exact: true }).click();
        d = page.waitForEvent('download');
        await page.locator('.report-heading button.primary').click();
        const dl = await d;
        const file = resolve(OUT, `report-${lang}.docx`);
        await dl.saveAs(file);
        const xml = execFileSync('unzip', ['-p', file, 'word/document.xml']).toString('utf8');
        log['docx-' + lang] = { filename: dl.suggestedFilename(), bytes: readFileSync(file).length, rtl: xml.includes('<w:bidi'), tables: (xml.match(/<w:tbl>/g) || []).length, hasPlanName: xml.includes(planName.replace(/&/g, '&amp;')) };
        expect((log['docx-' + lang] as { tables: number }).tables).toBeGreaterThan(0);
    }

    // Print: the button calls window.print(); the printed output is Chromium's print rendering.
    const printed: Record<string, unknown> = {};
    for (const lang of ['ar', 'en'] as const) {
        const dir = await page.evaluate(() => document.documentElement.dir);
        if ((lang === 'ar') !== (dir === 'rtl')) await page.getByRole('button', { name: 'Language', exact: true }).click();
        await page.evaluate(() => { (window as unknown as { __printed: number }).__printed = 0; window.print = () => void (window as unknown as { __printed: number }).__printed++; });
        await page.getByRole('button', { name: lang === 'ar' ? 'طباعة / PDF' : 'Print / PDF', exact: true }).click();
        const calls = await page.evaluate(() => (window as unknown as { __printed: number }).__printed);
        await page.emulateMedia({ media: 'print' });
        const pdf = resolve(OUT, `print-${lang}.pdf`);
        await page.pdf({ path: pdf, format: 'A4', printBackground: true });
        await page.emulateMedia({ media: 'screen' });
        const f = pdfFacts(pdf);
        writeFileSync(resolve(OUT, `print-${lang}.txt`), f.text);
        printed[lang] = { printCalls: calls, dir: await page.evaluate(() => document.documentElement.dir), pages: f.pages, pageSize: f.size, hasTableHeader: /Formula result|نتيجة المعادلة/.test(f.text), hasT1566: f.text.includes('T1566'), hidesButtons: !/Download plan JSON|تنزيل الخطة JSON/.test(f.text) };
        expect(calls).toBe(1);
    }
    log.print = printed;

    log.cspViolations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    log.issues = issues;
    const origin = new URL(BASE).origin;
    log.foreignRequests = requests.filter((r) => { const u = new URL(r.split(' ')[1]); return !['data:', 'blob:'].includes(u.protocol) && u.origin !== origin; });
    log.apiRequests = [...new Set(requests.filter((r) => r.includes('/api/')).map((r) => r.replace(origin, '')))];
    writeFileSync(resolve(OUT, 'journey.json'), JSON.stringify(log, null, 2));
    expect(log.cspViolations).toEqual([]);
    expect(issues).toEqual([]);
    expect(log.foreignRequests).toEqual([]);
});
