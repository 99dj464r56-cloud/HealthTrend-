# HealthTrend

**本机健康趋势整理** — 化验、药盒与报告草稿留在你的设备上；需要换机或备份时，导出的是**加密**文件，不是明文病历。

> 不是问诊机器人，也不替你判断「正不正常」。参考区间来自你录入／报告上的数值；OCR 只出草稿，保存前必须人工核对。

## 为什么特别

| 点 | 说明 |
|----|------|
| 资料本机 | IndexedDB；无账号、无上传、无分析埋点 |
| 观察自带区间 | 上下限跟每一次化验走，不套通用「正常值」 |
| 照片 OCR 草稿 | 浏览器内识别，确认后才入库 |
| 加密 iCloud 备份 | `health-trend-personal.enc.json`；Mac 可自动写进备份文件夹，iPhone 用「备份到 iCloud」分享到「文件」 |
| 三模式 | 访客试玩 · 演示合成数据 · 个人加密档案 |
| Mac App | `/Applications/HealthTrend.app`，Touch ID 解锁 + 打印 |
| 家用多档案 | 路线图：同一设备多个人独立保险库（尚未做） |

## 快速开始

```bash
npm ci
npm run dev          # http://localhost:5173 — 个人模式请用 localhost（Touch ID / WebAuthn）
npm test
npm run build:pages  # GitHub Pages 安全构建（无个人种子，base=/HealthTrend-/）
```

Safari（iPhone／iPad）：打开站点 → 分享 → **添加到主屏幕**。个人档案改动后点横幅 **「备份到 iCloud」**，在「文件」里存到 iCloud 云盘。

## 仓库与作业页

- 作业远程：`https://github.com/99dj464r56-cloud/HealthTrend-`
- **公开演示（无需登录）**：[`https://99dj464r56-cloud.github.io/HealthTrend-/`](https://99dj464r56-cloud.github.io/HealthTrend-/) — 打开即选「访客」或「示范报告」
- 设计／计划：`docs/superpowers/`
- 隐私约定：`PRIVACY.md`
- Mac 桌面版 / Mac app：[下载 Download `HealthTrend-mac.zip`](https://github.com/99dj464r56-cloud/HealthTrend-/releases/latest/download/HealthTrend-mac.zip)（[Releases](https://github.com/99dj464r56-cloud/HealthTrend-/releases)；未签名公证，首次请右键 → 打开 / unsigned: right-click → Open）

## 安全注意

- 公开构建与分享包**不得**包含 `public/seeds/personal-backup.json` 或任何真实病历。
- 演示数据仅为合成样本；截图不含真实姓名／药名／生日。
- 不要把恢复口令写进仓库或截图。

## 作者 / Author

vimi

## License

仅供个人／课程作业使用；请勿把他人健康资料提交到公开仓库。
