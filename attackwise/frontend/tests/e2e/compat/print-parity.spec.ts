// Print output parity (CURRENT_PARITY P-21): the Final Plan printed by Chromium (print media, A4)
// in Angular and Vue with the same real data, state, language and fixed clock. Compares page count,
// page size, extracted text (pdftotext -layout) and rendered pages (pdftoppm, 72 dpi pixel diff),
// in English and Arabic. PDFs, texts and page images go to tmp/compat/print/.
import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRONTEND, ensureApi, routeAngularOfficialData, startApp, stopApp, stubFonts, waitForMatrix, warmBundle, type Kind, type Server } from './apps';

const OUT = resolve(FRONTEND, 'tmp/compat/print');
interface Variant { name: string; many: boolean; background: boolean }
const VARIANTS: Variant[] = [
    { name: 'default', many: false, background: false },
    { name: 'background', many: false, background: true },
    { name: 'long', many: true, background: false },
];
test.setTimeout(15 * 60 * 1000);

async function state(page: Page, many: boolean) {
    if (many) {
        // ~45 attacks (first three techniques of every tactic, unscored) to force several printed pages.
        const columns = page.locator('.tactic-column');
        for (let c = 0; c < (await columns.count()); c++) {
            for (let i = 0; i < 3; i++) {
                const sel = columns.nth(c).locator('.technique-card .technique-select').nth(i);
                if ((await sel.count()) === 0 || (await sel.getAttribute('aria-pressed')) === 'true') continue;
                await sel.click();
                await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
            }
        }
    }
    await page.getByRole('button', { name: /^T1566 Phishing/ }).click();
    await page.locator('#scenario-score').fill('8');
    await page.getByRole('button', { name: 'Save score', exact: true }).click();
    await page.getByRole('button', { name: /^T1190 Exploit Public-Facing Application/ }).click();
    await page.locator('#scenario-score').fill('5');
    await page.getByRole('button', { name: 'Save score', exact: true }).click();
    const nav = page.getByRole('navigation', { name: 'Plan views' });
    await nav.getByRole('button', { name: /Defensive Plan/ }).click();
    await page.locator('.attack-list').getByRole('button', { name: /T1566/ }).click();
    await page.locator('.mitigation[data-source=attack] .choose-defense').first().click();
    await page.locator('#scenario-score').fill('6');
    await page.getByRole('button', { name: 'Save score', exact: true }).click();
    await nav.getByRole('button', { name: /Final Plan/ }).click();
    await page.locator('.report-table').waitFor();
}

async function printPdf(browser: Browser, kind: Kind, server: Server, lang: 'en' | 'ar', variant: Variant) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await stubFonts(context);
    if (kind === 'angular') await routeAngularOfficialData(context);
    await context.addInitScript(() => localStorage.setItem('attackwise-language', 'en'));
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    await page.clock.setFixedTime(new Date('2026-11-21T10:00:00Z'));
    await page.goto(server.url + '/');
    await waitForMatrix(page);
    await state(page, variant.many);
    if (lang === 'ar') await page.getByRole('button', { name: 'Language', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: 'print' });
    const tag = `final-${variant.name}-${lang}`;
    const pdf = resolve(OUT, `${tag}.${kind}.pdf`);
    // printBackground=false is Chrome's print-dialog default ("Background graphics" unchecked).
    await page.pdf({ path: pdf, format: 'A4', printBackground: variant.background });
    await context.close();
    const info = execFileSync('pdfinfo', [pdf]).toString();
    const text = execFileSync('pdftotext', ['-layout', pdf, '-']).toString();
    writeFileSync(pdf.replace(/\.pdf$/, '.txt'), text);
    const prefix = resolve(OUT, `${tag}.${kind}`);
    execFileSync('pdftoppm', ['-r', '72', '-png', pdf, prefix]);
    const pngs = readdirSync(OUT).filter((f) => f.startsWith(`${tag}.${kind}-`) && f.endsWith('.png')).sort();
    return { pages: Number(/Pages:\s+(\d+)/.exec(info)![1]), size: /Page size:\s+([^\n]+)/.exec(info)![1].trim(), text, pngs };
}

async function diff(page: Page, a: string, b: string) {
    return page.evaluate(
        async ([ua, ub]) => {
            const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
            const [ia, ib] = await Promise.all([load(ua), load(ub)]);
            const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
            const px = (img: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!; x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
            const da = px(ia), db = px(ib);
            let n = 0;
            for (let p = 0; p < da.length; p += 4) if (Math.max(Math.abs(da[p] - db[p]), Math.abs(da[p + 1] - db[p + 1]), Math.abs(da[p + 2] - db[p + 2])) > 24) n++;
            return { same: ia.width === ib.width && ia.height === ib.height, ratio: n / (w * h) };
        },
        ['data:image/png;base64,' + readFileSync(resolve(OUT, a)).toString('base64'), 'data:image/png;base64,' + readFileSync(resolve(OUT, b)).toString('base64')]
    );
}

test('printed Final Plan: same pages, text and rendering in Angular and Vue (EN and AR)', async () => {
    await ensureApi();
    await warmBundle('enterprise-attack', '20');
    mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const angular = await startApp('angular', 4211);
    const vue = await startApp('vue', 4212);
    const report: Record<string, unknown> = {};
    try {
        for (const variant of VARIANTS) for (const lang of ['en', 'ar'] as const) {
            const a = await printPdf(browser, 'angular', angular, lang, variant);
            const v = await printPdf(browser, 'vue', vue, lang, variant);
            const helper = await browser.newPage();
            const pages = [];
            for (let i = 0; i < Math.min(a.pngs.length, v.pngs.length); i++) pages.push(await diff(helper, a.pngs[i], v.pngs[i]));
            await helper.close();
            report[variant.name + '-' + lang] = {
                angular: { pages: a.pages, size: a.size },
                vue: { pages: v.pages, size: v.size },
                textEqual: a.text === v.text,
                pageDiffs: pages,
                hasTable: /T1566/.test(v.text) && /T1190/.test(v.text),
                tableRows: (v.text.match(/\bT1\d{3}(\.\d{3})?\b/g) || []).length,
                buttonsHidden: !/Download plan JSON|تنزيل الخطة JSON|Print \/ PDF|طباعة \/ PDF/.test(v.text),
            };
            expect(v.pages, lang + ' pages').toBe(a.pages);
            expect(v.size).toBe(a.size);
            expect(v.text, lang + ' printed text').toBe(a.text);
            for (const p of pages) expect(p.ratio, lang + ' page pixel diff').toBeLessThan(0.005);
        }
    } finally {
        writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
        await browser.close();
        await stopApp(angular);
        await stopApp(vue);
    }
});
