// Originally copied from the ATT&CK Navigator reference (nav-app/e2e/planning-icons.spec.ts); now maintained here.
import { test, expect } from '@playwright/test';
import { matrixSDO, TA0000, TA0001, T0000 } from '../../../../shared/fixtures/mock-data';
import { mockAttackData } from './mock-attack-data';

test('planning SVG icons and labels render at desktop and mobile widths', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await mockAttackData(page, [matrixSDO, TA0000, TA0001, T0000]);
    await page.addInitScript(() => localStorage.setItem('attackwise-language','en'));
    await page.goto('/');
    await expect(page.locator('.workspace-tools')).toBeVisible();
    await page.getByRole('button',{name:'New plan',exact:true}).click();
    await page.getByLabel('Plan Name', { exact: true }).fill('Icon verification');
    await page.getByRole('button', { name: 'Start Threat Assessment' }).click();
    await expect(page.locator('.workspace-tools')).toContainText('Icon verification');
    const navigation = page.getByRole('navigation', { name: 'Plan views' });
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const label of ['Attack Plan', 'Defensive Plan', 'Final Plan']) {
            const button = navigation.getByRole('button', { name: new RegExp(label) });
            await button.click();
            await expect(button).toHaveAttribute('aria-current', 'step');
            const svg = button.locator('svg');
            await expect(svg).toBeVisible();
            await expect(svg).toHaveAttribute('aria-hidden', 'true');
            await expect(svg).toHaveAttribute('stroke-width', '1.75');
            const bounds = await svg.boundingBox();
            expect(bounds?.width).toBe(14);
            expect(bounds?.height).toBe(14);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            const interfaceText = await page.locator('.attackwise').innerText();
            expect(interfaceText).not.toMatch(/[\p{Emoji_Presentation}\uFE0F]/u);
        }
    }
    expect(errors).toEqual([]);
});
