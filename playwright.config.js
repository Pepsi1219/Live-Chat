import { defineConfig, devices } from '@playwright/test';

// e2e smoke tests — รัน dev server อัตโนมัติแล้วทดสอบ UI flow ที่ไม่ต้องพึ่ง backend จริง
// ติดตั้ง browser ครั้งแรกด้วย:  npx playwright install chromium
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
