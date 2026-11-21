// UI parity: identical synthetic data, language, viewport, theme and fixed clock in both apps.
// For every view: accessibility tree (roles/names/states) must be identical; screenshots are
// pixel-compared in the browser (per-channel tolerance 24) and the diff ratio is recorded.
// Also checks keyboard reachability/activation of the main controls and horizontal overflow.
import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRONTEND, REPO, startApp, stopApp, type Kind, type Server } from './apps';
import { matrixSDO, TA0000, TA0001, T0000, T0000_000, T0000_002, T0001, M0000, configData } from '../../../../shared/fixtures/mock-data';

const OUT = resolve(FRONTEND, 'tmp/compat/ui');
const MAX_DIFF_RATIO = Number(process.env.UI_MAX_DIFF_RATIO || 0.005);
test.setTimeout(20 * 60 * 1000);

const config = JSON.parse(readFileSync(resolve(REPO, 'nav-app/src/assets/config.json'), 'utf8'));
const parent = { ...T0000, name: 'Active Scanning', external_references: [{ external_id: 'T1595', url: 'https://attack.mitre.org/techniques/T1595/' }], x_mitre_platforms: ['PRE'] };
const children = [T0000_000, T0000_002].map((c, i) => ({ ...c, name: ['Scanning IP Blocks', 'Vulnerability Scanning'][i], external_references: [{ external_id: `T1595.00${i + 1}` }] }));
const objects = [
    { ...M0000, name: 'Network Defense', description: 'Synthetic mitigation description.' },
    { ...M0000, id: 'course-of-action-unmapped', name: 'Unrelated defense', external_references: [{ external_id: 'M9999' }] },
    { type: 'relationship', id: 'relationship-defense', relationship_type: 'mitigates', source_ref: M0000.id, target_ref: parent.id },
    { ...matrixSDO, tactic_refs: [TA0000.id, TA0001.id] },
    { ...TA0000, name: 'Reconnaissance' },
    { ...TA0001, name: 'Resource Development' },
    parent,
    ...children,
    { ...T0001, name: 'Shared technique', kill_chain_phases: [TA0000, TA0001].map((t) => ({ kill_chain_name: 'mitre-attack', phase_name: t.x_mitre_shortname })) },
    ...children.map((c, i) => ({ type: 'relationship', id: `rel-${i}`, relationship_type: 'subtechnique-of', source_ref: c.id, target_ref: parent.id })),
];

async function prepare(browser: Browser, server: Server, lang: 'ar' | 'en', theme: 'indigo' | 'ember', width: number) {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await context.route('**/assets/config.json', (r) => r.fulfill({ json: { ...config, collection_index_url: '', versions: configData } }));
    await context.route(configData.entries[0].domains[0].data[0], (r) => r.fulfill({ json: { type: 'bundle', id: 'bundle-ui', objects } }));
    await context.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
    await context.addInitScript(
        ([l, t]) => {
            if (!sessionStorage.getItem('seeded')) {
                localStorage.setItem('attackwise-language', l);
                localStorage.setItem('attackwise-theme', t);
                sessionStorage.setItem('seeded', '1');
            }
        },
        [lang, theme]
    );
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-11-21T10:00:00Z'));
    await page.goto(server.url + '/');
    await page.locator('.matrix-columns').waitFor();
    await page.evaluate(() => document.fonts.ready);
    return page;
}

async function script(page: Page) {
    // Identical state in both apps: T1595 (score 8) + T1595.001 (unscored), official defense 9, D3FEND card visible.
    await page.locator('.technique-card').filter({ has: page.locator('.technique-id', { hasText: /^T1595$/ }) }).locator('.technique-select').click();
    await page.locator('#scenario-score').fill('8');
    await page.locator('.score-drawer button[type=submit]').click();
    await page.locator('.card-options button').first().click();
    await page.locator('.child-select').first().click();
    await page.locator('.score-drawer form button[type=button]').last().click();
}

async function capture(page: Page, name: string) {
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    const aria = (await page.locator('.attackwise').ariaSnapshot()).replace(/\d{1,2}:\d{2}[^\n]*/g, '<time>');
    const png = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    return { name, aria, png, overflow };
}

async function views(page: Page) {
    const shots = [];
    await script(page);
    shots.push(await capture(page, 'attack'));
    const nav = page.getByRole('navigation').first().locator('button');
    await nav.nth(1).click();
    await page.locator('.attack-list').waitFor();
    shots.push(await capture(page, 'defensive'));
    await page.locator('.mitigation[data-source=attack] .choose-defense').first().click();
    await page.locator('#scenario-score').fill('9');
    await page.locator('.score-drawer button[type=submit]').click();
    shots.push(await capture(page, 'defensive-selected'));
    await nav.nth(2).click();
    await page.locator('.report-table').waitFor();
    shots.push(await capture(page, 'final'));
    await page.locator('.wise-brand').click();
    await page.locator('.wise-home').waitFor();
    shots.push(await capture(page, 'home'));
    return shots;
}

async function pixelDiff(page: Page, a: Buffer, b: Buffer, diffPath: string) {
    const result = await page.evaluate(
        async ([ua, ub]) => {
            const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
            const [ia, ib] = await Promise.all([load(ua), load(ub)]);
            const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
            const ctx = (img: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!; x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
            const da = ctx(ia), db = ctx(ib);
            const out = document.createElement('canvas'); out.width = w; out.height = h; const ox = out.getContext('2d')!; const od = ox.createImageData(w, h);
            let diff = 0;
            for (let p = 0; p < da.length; p += 4) {
                const d = Math.max(Math.abs(da[p] - db[p]), Math.abs(da[p + 1] - db[p + 1]), Math.abs(da[p + 2] - db[p + 2]));
                if (d > 24) { diff++; od.data[p] = 255; od.data[p + 3] = 255; } else { od.data[p] = od.data[p + 1] = od.data[p + 2] = da[p] / 4; od.data[p + 3] = 255; }
            }
            ox.putImageData(od, 0, 0);
            return { sizeA: [ia.width, ia.height], sizeB: [ib.width, ib.height], diff, ratio: diff / (w * h), diffPng: out.toDataURL('image/png') };
        },
        ['data:image/png;base64,' + a.toString('base64'), 'data:image/png;base64,' + b.toString('base64')]
    );
    writeFileSync(diffPath, Buffer.from(result.diffPng.split(',')[1], 'base64'));
    return { sizeA: result.sizeA, sizeB: result.sizeB, diffPixels: result.diff, ratio: Number(result.ratio.toFixed(5)) };
}

test('same accessibility tree and near-identical rendering: AR/EN × desktop/phone × themes', async () => {
    mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    const servers: Record<Kind, Server> = { angular: await startApp('angular', 4186), vue: await startApp('vue', 4187) };
    const matrix = [
        { lang: 'ar', theme: 'indigo', width: 1440 },
        { lang: 'en', theme: 'indigo', width: 1440 },
        { lang: 'ar', theme: 'ember', width: 390 },
        { lang: 'en', theme: 'ember', width: 390 },
    ] as const;
    const report: unknown[] = [];
    const failures: string[] = [];
    try {
        for (const m of matrix) {
            const shots: Record<Kind, Awaited<ReturnType<typeof views>>> = { angular: [], vue: [] };
            for (const kind of ['angular', 'vue'] as Kind[]) {
                const page = await prepare(browser, servers[kind], m.lang, m.theme, m.width);
                shots[kind] = await views(page);
                await page.context().close();
            }
            const helper = await browser.newPage();
            for (let i = 0; i < shots.angular.length; i++) {
                const a = shots.angular[i], v = shots.vue[i];
                const tag = `${m.lang}-${m.theme}-${m.width}-${a.name}`;
                writeFileSync(resolve(OUT, tag + '.angular.png'), a.png);
                writeFileSync(resolve(OUT, tag + '.vue.png'), v.png);
                const diff = await pixelDiff(helper, a.png, v.png, resolve(OUT, tag + '.diff.png'));
                const ariaEqual = a.aria === v.aria;
                if (!ariaEqual) {
                    writeFileSync(resolve(OUT, tag + '.angular.aria.yml'), a.aria);
                    writeFileSync(resolve(OUT, tag + '.vue.aria.yml'), v.aria);
                    failures.push(tag + ': accessibility tree differs');
                }
                if (diff.ratio > MAX_DIFF_RATIO) failures.push(`${tag}: pixel diff ${diff.ratio}`);
                if (a.overflow !== v.overflow) failures.push(`${tag}: horizontal overflow differs`);
                report.push({ view: tag, ariaEqual, ...diff, overflow: { angular: a.overflow, vue: v.overflow } });
            }
            await helper.close();
        }
        // Keyboard: Tab reaches the language toggle, Enter activates it, focus stays visible; same in both apps.
        const keyboard: Record<string, unknown> = {};
        for (const kind of ['angular', 'vue'] as Kind[]) {
            const page = await prepare(browser, servers[kind], 'en', 'indigo', 1440);
            const reached: string[] = [];
            for (let i = 0; i < 12; i++) {
                await page.keyboard.press('Tab');
                reached.push(await page.evaluate(() => { const e = document.activeElement as HTMLElement; return (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 40); }));
            }
            await page.getByRole('button', { name: 'Language', exact: true }).focus();
            const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
            await page.keyboard.press('Enter');
            const dir = await page.evaluate(() => document.documentElement.dir);
            keyboard[kind] = { reached, outline, dirAfterEnter: dir };
            await page.context().close();
        }
        expect(keyboard.vue).toEqual(keyboard.angular);
        report.push({ keyboard });
    } finally {
        writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
        await browser.close();
        await stopApp(servers.angular);
        await stopApp(servers.vue);
    }
    expect(failures).toEqual([]);
});
