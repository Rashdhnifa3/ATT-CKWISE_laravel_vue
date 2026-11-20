import { test, expect } from '@playwright/test';
import { matrixSDO, TA0000, T0000, M0000 } from '../src/tests/utils/mock-data';
import { mockAttackData } from './mock-attack-data';

const attack = { ...T0000, name: 'Active Scanning', external_references: [{ external_id: 'T1595', url: 'https://attack.mitre.org/techniques/T1595/' }] };
const objects = [
    { ...M0000, name: 'Network Defense' },
    { type: 'relationship', id: 'relationship-defense', relationship_type: 'mitigates', source_ref: M0000.id, target_ref: attack.id },
    { ...matrixSDO, tactic_refs: [TA0000.id] },
    { ...TA0000, name: 'Reconnaissance' },
    attack,
];

test('plans autosave and can be resumed by name after closing the site', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockAttackData(page, objects);
    await page.addInitScript(() => { if (!localStorage.getItem('attackwise-language')) localStorage.setItem('attackwise-language', 'en'); });
    await page.goto('/');

    // Save draft button is gone from the attack plan.
    await expect(page.locator('.floating-bottom')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0);

    // Work on the first plan: select an attack, score it, move to the defensive step.
    await page.getByRole('button', { name: /T1595 Active Scanning/ }).click();
    await page.locator('#scenario-score').fill('7');
    await page.getByRole('button', { name: 'Save score', exact: true }).click();
    await page.getByRole('navigation', { name: 'Plan views' }).getByRole('button', { name: /Defensive Plan/ }).click();

    // Create a second plan.
    await page.getByRole('button', { name: 'New plan' }).click();
    await page.locator('#plan-name').fill('Second Plan');
    await page.getByRole('button', { name: 'Start Threat Assessment' }).click();
    await expect(page.locator('.workspace-tools')).toContainText('Second Plan');

    // "Close" the site and open it again.
    await page.reload();
    const saved = page.locator('.wise-saved-plans');
    await expect(saved.locator('li')).toHaveCount(2);
    await expect(saved).toContainText('Second Plan');
    await expect(saved).toContainText('Enterprise Threat Plan');

    // Resume the first plan: same step, same selection, same score.
    await saved.getByRole('button', { name: /^Enterprise Threat Plan/ }).click();
    await expect(page.locator('.workspace-tools')).toContainText('Enterprise Threat Plan');
    await expect(page.getByRole('navigation', { name: 'Plan views' }).getByRole('button', { name: /Defensive Plan/ })).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('.selected-pill')).toContainText('1');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('attackwise-plans') || '[]'));
    const first = stored.find((p) => p.name === 'Enterprise Threat Plan');
    expect(JSON.parse(first.data).attackwise.planning.attackScores.T1595).toBe(7);

    // Resuming again does not create a duplicate entry.
    await page.reload();
    await expect(page.locator('.wise-saved-plans li')).toHaveCount(2);

    // Delete a saved plan.
    await page.locator('.wise-saved-plans li').filter({ hasText: 'Second Plan' }).getByRole('button', { name: /Delete plan/ }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('.wise-saved-plans li')).toHaveCount(1);
    expect(errors).toEqual([]);
});
