import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 3000,
    open: true,
    host: '0.0.0.0', // 外部からのアクセスを明示的に許可
    strictPort: true  // ポート3000を強制使用
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});