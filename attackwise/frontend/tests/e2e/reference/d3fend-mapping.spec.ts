// Originally copied from the ATT&CK Navigator reference (nav-app/e2e/d3fend-mapping.spec.ts); now maintained here.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseD3fend, d3fendRelationsFor } from '../../../src/planning/d3fend-data';
import { restorePlanning } from '../../../src/planning/planning-state';
import { calculateRisk } from '../../../src/planning/risk-calculation';
import { matrixSDO, TA0000, TA0001, T0000, T0000_000, T0000_002, T0001, M0000 } from '../../../../shared/fixtures/mock-data';
import { mockAttackData } from './mock-attack-data';

const assetPath = 'public/assets/d3fend/attack-d3fend.json';
const readAsset = () => JSON.parse(readFileSync(assetPath, 'utf8'));

test('imported D3FEND data: exact-ID lookup, no parent inheritance, no duplicates, evidence kept', () => {
    const index = parseD3fend(readAsset());
    expect(index.defenses.size).toBe(149);
    const ids = (attackID: string) => d3fendRelationsFor(index, attackID).map((r) => r.defense.id);
    // T1557 and T1557.001 have their own rows; T1557.002 has none and must not inherit the parent's.
    expect(ids('T1557')).toHaveLength(9);
    expect(ids('T1557.001')).toHaveLength(10);
    expect(ids('T1557.001')).toContain('d3f:ConnectionAttemptAnalysis');
    expect(ids('T1557')).not.toContain('d3f:ConnectionAttemptAnalysis');
    expect(ids('T1557.002')).toEqual([]);
    // T1003 only appears through its sub-techniques in the source.
    expect(ids('T1003')).toEqual([]);
    expect(ids('T1003.008')).toHaveLength(22);
    expect(ids('T1595')).toEqual([]);
    for (const [attackID, list] of index.relations) {
        const unique = new Set(list.map((r) => r.defense.id + '|' + r.type));
        expect(unique.size, attackID).toBe(list.length);
        for (const r of list) expect(r.type).toBe('D3FEND inferred mapping');
    }
    // The same defense is reused across techniques.
    const shared = [...index.relations.values()].filter((list) => list.some((r) => r.defense.id === 'd3f:NetworkTrafficFiltering'));
    expect(shared.length).toBeGreaterThan(50);
    const evidence = d3fendRelationsFor(index, 'T1557').find((r) => r.defense.id === 'd3f:NetworkTrafficFiltering')!.evidence;
    expect(evidence).toEqual([{ defenseRelation: 'filters', offensiveRelation: 'produces', artifact: 'Network Traffic', attackTactics: ['Collection', 'Credential Access'] }]);
    expect(index.defenses.get('d3f:NetworkTrafficFiltering')).toMatchObject({ name: 'Network Traffic Filtering', tactic: 'Isolate' });
});

test('re-running the import produces identical output', () => {
    const before = readFileSync(assetPath, 'utf8');
    execFileSync(process.execPath, ['scripts/import-d3fend.mjs'], { stdio: 'pipe' });
    expect(readFileSync(assetPath, 'utf8')).toBe(before);
});

test('saved plans keep D3FEND selections and scores; scoring reuses the existing formula', () => {
    const restored = restorePlanning({
        selectedDefenses: ['d3f:NetworkTrafficFiltering'],
        defenseScores: { 'd3f:NetworkTrafficFiltering': 7 },
        defenseSelections: { T1557: { 'd3f:NetworkTrafficFiltering': true } },
        standaloneDefenses: [],
    });
    expect(restored.selectedDefenses).toEqual(['d3f:NetworkTrafficFiltering']);
    expect(restored.defenseScores['d3f:NetworkTrafficFiltering']).toBe(7);
    expect(restored.defenseSelections['T1557']['d3f:NetworkTrafficFiltering']).toBe(true);
    expect(calculateRisk(8, [7], 'strongest')).toEqual({ defense: 7, result: 1, risk: 1 });
});

const parent = { ...T0000, name: 'Adversary-in-the-Middle', external_references: [{ external_id: 'T1557' }] };
const children = [T0000_000, T0000_002].map((child, i) => ({
    ...child,
    name: ['Name Resolution Poisoning and SMB Relay', 'ARP Cache Poisoning'][i],
    external_references: [{ external_id: ['T1557.001', 'T1557.002'][i] }],
}));
const objects = [
    { ...M0000, name: 'Network Defense' },
    { type: 'relationship', id: 'relationship-defense', relationship_type: 'mitigates', source_ref: M0000.id, target_ref: parent.id },
    { ...matrixSDO, tactic_refs: [TA0000.id, TA0001.id] },
    { ...TA0000, name: 'Reconnaissance' },
    { ...TA0001, name: 'Resource Development' },
    parent,
    ...children,
    { ...T0001, name: 'Unmapped technique', external_references: [{ external_id: 'T1595' }] },
    ...children.map((child, i) => ({ type: 'relationship', id: `relationship-child-${i}`, relationship_type: 'subtechnique-of', source_ref: child.id, target_ref: parent.id })),
];

test('all D3FEND techniques join the mitigation list, filter by attack, score, persist and reach the Final Plan', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockAttackData(page, objects);
    await page.addInitScript(() => localStorage.setItem('attackwise-language', 'en'));
    await page.goto('/');
    await page.getByRole('button', { name: /T1557 Adversary-in-the-Middle/ }).click();
    await page.locator('#scenario-score').fill('8');
    await page.getByRole('button', { name: 'Save score', exact: true }).click();
    await expect(page.locator('.score-drawer')).toHaveCount(0);
    await page.getByRole('button', { name: /2 sub-techniques/ }).click();
    await page.locator('.child-select', { hasText: 'T1557.002' }).click();
    await page.getByRole('button', { name: 'Skip for now', exact: true }).click();

    const nav = page.getByRole('navigation', { name: 'Plan views' });
    await nav.getByRole('button', { name: /Defensive Plan/ }).click();
    const attackButton = (id: string) =>
        page.locator('.attack-list > button').filter({ has: page.locator('.technique-id', { hasText: new RegExp('^' + id.replace('.', '\\.') + '$') }) });
    const d3fend = page.locator('.mitigation.d3fend');
    const attackMitigations = page.locator('.mitigation[data-source=attack]');

    // "All mitigations" lists every ATT&CK mitigation and every imported D3FEND technique.
    await expect(attackMitigations).toHaveCount(1);
    await expect(d3fend).toHaveCount(149);
    await expect(page.locator('.results-count')).toHaveText('150 mitigations');
    await expect(page.locator('.defense-stats')).toHaveCount(0);

    // Selecting an attack shows only mitigations related to that technique, from both sources.
    await attackButton('T1557').click();
    await expect(d3fend).toHaveCount(9);
    await expect(attackMitigations).toHaveCount(1);
    await expect(d3fend.first()).toContainText('D3FEND inferred mapping');
    // The sub-technique has no rows of its own and does not inherit the parent's D3FEND relations.
    await attackButton('T1557.002').click();
    await expect(d3fend).toHaveCount(0);
    await expect(page.locator('.d3fend-empty')).toContainText('No D3FEND mapping for T1557.002');

    await page.getByRole('button', { name: /All mitigations/ }).click();
    const filter = page.getByLabel('Mitigation filter', { exact: true });
    await expect(filter.locator('option')).toHaveText(['All types', 'MITRE ATT&CK', 'MITRE D3FEND', 'Custom', 'Selected only']);
    await filter.selectOption('Official');
    await expect(d3fend).toHaveCount(0);
    await filter.selectOption('D3FEND');
    await expect(attackMitigations).toHaveCount(0);
    await expect(d3fend).toHaveCount(149);
    await filter.selectOption('All');

    const ntf = d3fend.filter({ hasText: 'Network Traffic Filtering' });
    await expect(ntf).toContainText('d3f:NetworkTrafficFiltering');
    await expect(ntf).toContainText('D3FEND tactic: Isolate');
    await ntf.getByRole('button', { name: 'Select defense', exact: true }).click();
    await page.locator('#scenario-score').fill('7');
    await page.getByRole('button', { name: 'Save score', exact: true }).click();
    await expect(page.locator('.score-drawer')).toHaveCount(0);
    await expect(ntf).toHaveClass(/chosen/);
    await expect(ntf).toHaveAttribute('data-defense', 'high');

    // A custom mitigation linked to two attacks, scored directly in its form.
    await page.getByRole('button', { name: 'Add defense', exact: true }).click();
    await page.getByLabel('Defense name', { exact: true }).fill('Segment broadcast domains');
    await page.locator('.custom-attacks label', { hasText: 'T1557.002' }).locator('input').check();
    await page.locator('#custom-score').fill('5');
    await page.getByRole('button', { name: 'Save defense', exact: true }).click();
    const custom = page.locator('.mitigation.custom');
    await expect(custom).toContainText('5/10');
    await expect(custom).toContainText('T1557 · T1557.002');
    await filter.selectOption('Selected');
    await expect(page.locator('.mitigation')).toHaveCount(2);
    await filter.selectOption('All');

    const row = (id: string) =>
        page.locator('.report-table tbody tr').filter({ has: page.locator('.technique-id', { hasText: new RegExp('^' + id.replace('.', '\\.') + '$') }) });
    await nav.getByRole('button', { name: /Final Plan/ }).click();
    await expect(row('T1557').locator('.combined-defense')).toHaveText('7');
    await expect(row('T1557').locator('.formula-result')).toHaveText('1');
    await row('T1557').locator('summary').click();
    await expect(row('T1557').locator('summary')).toHaveText('2');
    await expect(row('T1557').locator('[data-source=d3fend]')).toContainText('MITRE D3FEND');
    await expect(row('T1557.002').locator('summary')).toHaveText('1');

    await page.reload();
    await page.locator('.wise-saved-plans .saved-plan-open').first().click();
    await nav.getByRole('button', { name: /Final Plan/ }).click();
    await expect(row('T1557').locator('.formula-result')).toHaveText('1');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download plan JSON', exact: true }).click();
    await page.locator('#uploader').setInputFiles((await (await downloaded).path())!);
    await nav.getByRole('button', { name: /Defensive Plan/ }).click();
    await expect(page.locator('.mitigation.d3fend.chosen')).toHaveCount(1);
    await nav.getByRole('button', { name: /Final Plan/ }).click();
    await expect(row('T1557').locator('.formula-result')).toHaveText('1');

    // Removing the D3FEND choice drops it from the plan only; the reference card stays listed.
    await nav.getByRole('button', { name: /Defensive Plan/ }).click();
    await page.locator('.mitigation.d3fend.chosen').getByRole('button', { name: 'Selected', exact: true }).click();
    await expect(page.locator('.mitigation.d3fend.chosen')).toHaveCount(0);
    await expect(d3fend).toHaveCount(149);
    expect(errors).toEqual([]);
});
