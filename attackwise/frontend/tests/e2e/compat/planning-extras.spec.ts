// Planning controls not covered elsewhere, compared in Angular and Vue on the same real Enterprise
// release: "Show more techniques" (20 per column, +20 per click), "Clear score" in the drawer,
// "Clear" (all selections and scores), "Color Blind Friendly" (class + persisted preference across a
// reload) and "Print / PDF" (window.print is called once; the print dialog itself is stubbed).
import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRONTEND, ensureApi, routeAngularOfficialData, startApp, stopApp, stubFonts, waitForMatrix, warmBundle, type Kind, type Server } from './apps';

const OUT = resolve(FRONTEND, 'tmp/compat/planning-extras');
test.setTimeout(15 * 60 * 1000);

async function flow(browser: Browser, kind: Kind, server: Server) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await stubFonts(context);
    if (kind === 'angular') await routeAngularOfficialData(context);
    await context.addInitScript(() => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('attackwise-language', 'en');
            sessionStorage.setItem('seeded', '1');
        }
        (window as unknown as { __prints: number }).__prints = 0;
        window.print = () => void (window as unknown as { __prints: number }).__prints++;
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(server.url + '/');
    await waitForMatrix(page);
    try {
        return await steps(page, errors);
    } catch (e) {
        // Keep what the page showed when a step failed (the test launches its own browser, so no fixture snapshot).
        await page.screenshot({ path: resolve(OUT, kind + '-failure.png'), fullPage: true }).catch(() => undefined);
        writeFileSync(resolve(OUT, kind + '-failure.aria.yml'), await page.locator('body').ariaSnapshot().catch(() => ''));
        throw e;
    } finally {
        await context.close();
    }
}

async function steps(page: Page, errors: string[]) {
    const out: Record<string, unknown> = {};

    // Show more techniques: per-column count before/after one click, in the busiest column.
    const columns = page.locator('.tactic-column');
    const perColumn = async () => columns.evaluateAll((cs) => cs.map((c) => c.querySelectorAll('.technique-card').length));
    out.cardsPerColumn = await perColumn();
    const busiest = (out.cardsPerColumn as number[]).indexOf(Math.max(...(out.cardsPerColumn as number[])));
    out.loadMoreButtons = await page.locator('.load-more').count();
    await columns.nth(busiest).locator('.load-more').click();
    out.cardsAfterOneClick = (await perColumn())[busiest];

    // Header search (attack view): by ID, by name (incl. sub-technique match), no match, cleared.
    const search = page.locator('.header-search input'); // a second copy (.mobile-search) is shown on narrow screens only
    const visibleIds = async () => page.locator('.tactic-column .technique-card .technique-id').allInnerTexts();
    out.search = {} as Record<string, unknown>;
    for (const q of ['T1566', 'phishing', 'spearphishing voice', 'zzzz-no-match', '']) {
        await search.fill(q);
        await page.waitForTimeout(300);
        (out.search as Record<string, unknown>)[q || '(cleared)'] = { ids: (await visibleIds()).slice(0, 40), columns: await columns.count(), empty: await page.locator('.filter-empty').count() };
    }

    // Score, then "Clear score" in the drawer.
    const card = page.getByRole('button', { name: /^T1566 Phishing/ });
    await card.click();
    await page.locator('#scenario-score').fill('7');
    await page.getByRole('button', { name: 'Save score', exact: true }).click();
    await card.click(); // deselect
    await card.click(); // select again → drawer with the stored score
    out.drawerValue = await page.locator('#scenario-score').inputValue();
    await page.getByRole('button', { name: 'Clear score', exact: true }).click();
    out.afterClearScore = { drawerOpen: await page.locator('.score-drawer').count(), risk: await page.locator('.technique-card', { has: card }).getAttribute('data-risk') };
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^T1190 Exploit Public-Facing Application/ }).click();
    await page.getByRole('button', { name: 'Skip for now', exact: true }).click().catch(() => undefined);
    out.selectedBeforeClear = await page.locator('.selected-pill').innerText();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    out.afterClear = { pill: await page.locator('.selected-pill').innerText(), pressed: await page.locator('.technique-select[aria-pressed=true]').count() };

    // Final plan: Color Blind Friendly + Print / PDF.
    await card.click();
    await page.getByRole('button', { name: 'Skip for now', exact: true }).click().catch(() => undefined);
    await page.getByRole('navigation', { name: 'Plan views' }).getByRole('button', { name: /Final Plan/ }).click();
    const blind = page.getByLabel('Color Blind Friendly');
    await blind.check();
    out.colorBlind = { planner: await page.locator('.planner.color-blind').count(), stored: await page.evaluate(() => localStorage.getItem('attackwise-color-blind')) };
    await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
    out.printCalls = await page.evaluate(() => (window as unknown as { __prints: number }).__prints);
    await page.reload();
    // After a reload both apps show the home page with "Your saved plans" (no auto-open); resume the plan.
    out.homeAfterReload = await page.locator('.wise-saved-plans li').allInnerTexts().then((t) => t.map((x) => x.split('\n')[0]));
    await page.locator('.saved-plan-open').first().click();
    out.viewAfterResume = await page.locator('.reference-nav button[aria-current=step]').innerText(); // the saved view (Final) is restored
    await page.getByRole('navigation', { name: 'Plan views' }).getByRole('button', { name: /Final Plan/ }).click();
    out.colorBlindAfterReload = { checked: await page.getByLabel('Color Blind Friendly').isChecked(), planner: await page.locator('.planner.color-blind').count() };
    out.errors = errors;
    return out;
}

test('show more, clear score, clear, color-blind preference and print match on real data', async () => {
    await ensureApi();
    await warmBundle('enterprise-attack', '20');
    mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const angular = await startApp('angular', 4209);
    const vue = await startApp('vue', 4210);
    const report: Record<string, unknown> = {};
    try {
        report.angular = await flow(browser, 'angular', angular);
        report.vue = await flow(browser, 'vue', vue);
    } finally {
        writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
        await browser.close();
        await stopApp(angular);
        await stopApp(vue);
    }
    expect(report.vue).toEqual(report.angular);
    expect((report.angular as { printCalls: number }).printCalls).toBe(1);
});
