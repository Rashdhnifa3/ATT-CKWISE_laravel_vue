// Originally copied from the ATT&CK Navigator reference (nav-app/e2e/lovable-integration.spec.ts); now maintained here.
import { test, expect } from '@playwright/test';
import { matrixSDO, TA0000, TA0001, T0000, T0000_000, T0000_002, T0001, M0000 } from '../../../../shared/fixtures/mock-data';
import config from '../../../public/assets/config.json';
import { configData } from '../../../../shared/fixtures/mock-data';
import { mockAttackData } from './mock-attack-data';
const parent = {
    ...T0000,
    name: 'Active Scanning',
    external_references: [{ external_id: 'T1595', url: 'https://attack.mitre.org/techniques/T1595/' }],
};
const children = [T0000_000, T0000_002].map((child, i) => ({
    ...child,
    name: ['Scanning IP Blocks', 'Vulnerability Scanning'][i],
    external_references: [{ external_id: `T1595.00${i + 1}` }],
}));
const shared = {
    ...T0001,
    name: 'Shared technique',
    kill_chain_phases: [TA0000, TA0001].map((t) => ({ kill_chain_name: 'mitre-attack', phase_name: t.x_mitre_shortname })),
};
const objects = [
    { ...M0000, name: 'Network Defense' },
    { type: 'relationship', id: 'relationship-defense', relationship_type: 'mitigates', source_ref: M0000.id, target_ref: parent.id },
    { ...matrixSDO, tactic_refs: [TA0000.id, TA0001.id] },
    { ...TA0000, name: 'Reconnaissance' },
    { ...TA0001, name: 'Resource Development' },
    parent,
    ...children,
    shared,
    ...children.map((child, i) => ({
        type: 'relationship',
        id: `relationship-child-${i}`,
        relationship_type: 'subtechnique-of',
        source_ref: child.id,
        target_ref: parent.id,
    })),
];

test('Enterprise-only, optional scoring, per-attack defense selections, exports and RTL survive refresh', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await mockAttackData(page, objects);
    await page.addInitScript(() => { if (!localStorage.getItem('attackwise-language')) localStorage.setItem('attackwise-language','en'); });
    await page.goto('/');
    await expect(page.locator('.workspace-tools')).toBeVisible();
    await page.getByRole('button',{name:'New plan',exact:true}).click();
    await expect(page.locator('.wise-home')).not.toContainText(/Mobile|ICS|SCADA/);
    await page.getByLabel('Plan Name',{exact:true}).fill('Reference integration');
    await page.getByRole('button',{name:'Start Threat Assessment'}).click();
    const nav = page.getByRole('navigation',{name:'Plan views'});
    await page.getByRole('button',{name:/T1595 Active Scanning/}).click();
    await expect(page.locator('.score-drawer')).toBeVisible();
    await expect(page.locator('#scenario-score')).toHaveValue('');
    await page.getByRole('button',{name:'Skip for now',exact:true}).click();
    await nav.getByRole('button',{name:/Final Plan/}).click();
    await expect(page.locator('.report-table')).toContainText('Not Rated');
    await page.locator('.report-table').getByRole('button',{name:'Not Rated',exact:true}).click();
    await page.locator('#scenario-score').fill('0');
    await page.getByRole('button',{name:'Save score',exact:true}).click();
    await expect(page.locator('.report-table')).toContainText('0/10');
    await expect(page.locator('.score-drawer')).toHaveCount(0);
    await nav.getByRole('button',{name:/Attack Plan/}).click();
    await page.getByRole('button',{name:/2 sub-techniques/}).click();
    await page.getByRole('button',{name:/T1595.001 Scanning IP Blocks/}).click();
    await page.getByRole('button',{name:'Skip for now',exact:true}).click();
    await nav.getByRole('button',{name:/Defensive Plan/}).click();
    await page.locator('.attack-list').getByRole('button',{name:/Active Scanning/}).click();
    await page.getByRole('button',{name:'Select defense',exact:true}).click();
    await page.getByRole('button',{name:'Close scoring panel'}).click();
    await expect(page.locator('.attack-list .status[data-status=covered]')).toHaveCount(1);
    await page.locator('.attack-list').getByRole('button',{name:/T1595.001/}).click();
    await page.getByRole('button',{name:'Select defense',exact:true}).click();
    await page.getByRole('button',{name:'Close scoring panel'}).click();
    await expect(page.locator('.attack-list .status[data-status=covered]')).toHaveCount(2);
    await page.getByRole('button',{name:'Language',exact:true}).click();
    await expect(page.locator('html')).toHaveAttribute('dir','rtl');
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:'tmp/playwright/lovable-defense-ar.png',fullPage:true});
    await page.reload();
    await page.locator('.wise-saved-plans .saved-plan-open').first().click();
    await expect(page.locator('.selected-pill')).toContainText('2');
    await expect(page.locator('html')).toHaveAttribute('dir','rtl');
    await page.getByRole('button',{name:'Language',exact:true}).click();
    await nav.getByRole('button',{name:/Final Plan/}).click();
    await expect(page.locator('.coverage-gauge')).toContainText('Not Rated');
    await expect(page.locator('.report-table')).toContainText('0/10');
    await expect(page.locator('.report-table')).toContainText('Not Rated');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button',{name:'Export Word report (.docx)',exact:true}).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.docx$/);
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:'tmp/playwright/lovable-report-en.png',fullPage:true});
    await page.locator('.report-table').getByRole('button',{name:/0\/10/}).click();
    await page.getByRole('button',{name:'Clear score',exact:true}).click();
    await expect(page.locator('.report-table').getByRole('button',{name:'Not Rated',exact:true})).toHaveCount(2);
    expect(errors).toEqual([]);
});
