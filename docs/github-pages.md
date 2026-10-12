# GitHub Pages

1. 推送 `main` 后，仓库 **Settings → Pages → Build and deployment → Source: GitHub Actions**。
2. 工作流：`.github/workflows/pages.yml`（`npm run build:pages` → upload `dist`）。
3. 站点：`https://99dj464r56-cloud.github.io/HealthTrend-/`
4. 若 Actions 未开 Pages 权限：Settings → Actions → General → Workflow permissions → Read and write。

本地预览：

```bash
npm run build:pages
npx vite preview --base /HealthTrend-/
```
