import { expect, test } from '@playwright/test';

test('case status uses the branded list, persists the choice and restores focus on undo', async ({ page }) => {
  await page.goto('/');
  const status = page.getByRole('combobox', { name: 'Case status' });
  await expect(status).toHaveText('Active');
  await status.click();
  await expect(page.getByRole('option', { name: 'Active', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('option', { name: 'Draft', exact: true }).hover();
  await expect(page.getByRole('option', { name: 'Draft', exact: true })).toHaveCSS('background-color', 'rgb(247, 228, 231)');
  await page.getByRole('option', { name: 'Draft', exact: true }).click();
  await expect(status).toHaveText('Draft');
  await expect(status).toBeFocused();
  await page.keyboard.press('Control+z');
  await expect(status).toHaveText('Active');
  await expect(status).toBeFocused();
});

test('keyboard selection, typeahead and Escape keep predictable focus and values', async ({ page }) => {
  await page.goto('/');
  const status = page.getByRole('combobox', { name: 'Case status' });
  await status.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Home');
  await expect(page.getByRole('option', { name: 'Draft', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Draft');
  await status.press('ArrowDown');
  await page.keyboard.press('d');
  await expect(page.getByRole('option', { name: 'Deprecated', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(status).toHaveText('Draft');
  await expect(status).toBeFocused();
  await status.press('ArrowDown');
  await page.keyboard.press('End');
  await expect(page.getByRole('option', { name: 'Deprecated', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(status).toHaveText('Deprecated');
});

test('explicit empty values can be selected again, without colliding with literal values', async ({ page }) => {
  await page.goto('/e2e/select-harness.html');
  const choice = page.getByRole('combobox', { name: 'Example choice' });
  await choice.click();
  await page.getByRole('option', { name: 'None', exact: true }).click();
  await expect(page.getByLabel('Stored value')).toHaveText('""');
  await choice.click();
  await expect(page.getByRole('option', { name: 'None', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('option', { name: 'Literal prefix value' }).click();
  await expect(page.getByLabel('Stored value')).toHaveText('"option:"');
});

test('disabled choices are skipped and a disabled control cannot be opened', async ({ page }) => {
  await page.goto('/e2e/select-harness.html');
  const choice = page.getByRole('combobox', { name: 'Example choice' });
  await choice.click();
  await expect(page.getByRole('option', { name: 'Unavailable', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(choice).toHaveText('Literal prefix value');
  await page.getByRole('button', { name: 'Toggle disabled' }).click();
  await expect(choice).toBeDisabled();
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('long lists scroll and stay within a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/e2e/select-harness.html');
  const choice = page.getByRole('combobox', { name: 'Example choice' });
  await choice.click();
  const bounds = await page.getByRole('listbox').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(8);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(312);
  expect(bounds!.height).toBeLessThanOrEqual(320);
  await page.keyboard.press('End');
  await expect(page.getByRole('option', { name: /^80\./ })).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Stored value')).toHaveText('"long-79"');
});

test('select inside a dialog does not dismiss its parent and returns focus correctly', async ({ page }) => {
  await page.goto('/?view=runs');
  await page.getByRole('button', { name: 'New run', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const args = page.getByRole('combobox', { name: 'Run arguments set' });
  await args.click();
  await page.getByRole('option', { name: /^Development/ }).click();
  await expect(dialog).toBeVisible();
  await expect(args).toContainText('Development');
  await args.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(args).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('calendar uses the same control and switches the displayed year', async ({ page }) => {
  await page.goto('/?view=runs');
  const year = page.getByRole('combobox', { name: 'Activity year' });
  const previous = String(new Date().getFullYear() - 1);
  await year.click();
  await page.getByRole('option', { name: previous, exact: true }).click();
  await expect(year).toHaveText(previous);
  await expect(page.getByRole('region', { name: 'Test activity calendar' })).toContainText(`recorded in ${previous}`);
});
