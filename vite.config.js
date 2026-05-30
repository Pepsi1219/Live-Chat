import { defineConfig } from 'vite';

export default defineConfig({
  // เส้นทางแบบ relative — ใช้ได้ทั้ง Firebase Hosting และ subpath
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js'],
  },
});
