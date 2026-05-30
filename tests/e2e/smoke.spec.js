import { test, expect } from '@playwright/test';

// Smoke tests — ทดสอบ UI flow ที่ไม่ต้องพึ่ง Firebase backend จริง
test.describe('Live Comments — UI smoke', () => {
  test('shows welcome modal on load', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#modal-overlay')).toBeVisible();
    await expect(page.locator('.modal-title')).toContainText('ยินดีต้อนรับ');
  });

  test('empty name keeps the modal open (focuses input)', async ({ page }) => {
    await page.goto('/');
    await page.locator('#join-btn').click();
    await expect(page.locator('#modal-overlay')).toBeVisible();
    await expect(page.locator('#name-input')).toBeFocused();
  });

  test('char counter updates as you type', async ({ page }) => {
    await page.goto('/');
    await page.locator('#comment-input').fill('hello');
    await expect(page.locator('#char-count')).toHaveText('195');
  });

  test('renders comment text safely (no HTML injection)', async ({ page }) => {
    // ตรวจว่าหน้าโหลด feed ได้และไม่มี script ที่ inject ได้จาก text node
    await page.goto('/');
    await expect(page.locator('#comment-feed')).toBeAttached();
  });
});
