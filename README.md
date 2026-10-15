# HealthTrend

**本机健康趋势整理** — 化验、药盒与报告草稿留在你的设备上；个人档案本机直开（设备解锁即可，无需 App 密码）。换机时请用「导出加密备份」，恢复时输入备份密码。

> 不是问诊机器人，也不替你判断「正不正常」。参考区间来自你录入／报告上的数值；OCR 只出草稿，保存前必须人工核对。

## 为什么特别

| 点 | 说明 |
|----|------|
| 资料本机 | IndexedDB；无账号、无上传、无分析埋点 |
| 观察自带区间 | 上下限跟每一次化验走，不套通用「正常值」 |
| 照片 OCR 草稿 | 浏览器内识别，确认后才入库 |
| 本机备份 | 「导出加密备份」；密码仅用于文件，日常打开不需密码 |
| 三模式 | 访客试玩 · 演示合成数据 · 个人本机档案 |
| Mac App | `/Applications/HealthTrend.app`，打印 |
| 家用多档案 | 路线图：同一设备多个人独立保险库（尚未做） |

## 快速开始

```bash
npm ci
npm run dev          # http://localhost:5173
npm test
VITE_BASE_PATH=/HealthTrend-trial/ npm run build:pages
VITE_BASE_PATH=/HealthTrend-trial/ node scripts/audit-public.mjs
```

Safari（iPhone／iPad）：打开站点 → 分享 → **添加到主屏幕**。需要备份时用 **「导出加密备份」**，再自行保存到「文件」或 iCloud。

个人记录在当前浏览器中未加密，由设备安全保护；导出的个人备份使用 AES-GCM 加密。忘记备份密码无法恢复。访客／示范 JSON 与 PDF 报告是明文。

## 仓库与作业页

- 开发源码（私有）：`https://github.com/99dj464r56-cloud/HealthTrend-`
- **公开演示（无需登录）**：[`https://99dj464r56-cloud.github.io/HealthTrend-trial/`](https://99dj464r56-cloud.github.io/HealthTrend-trial/) — 打开即选「访客」或「示范报告」
- 公开静态产物仓库：[HealthTrend-trial](https://github.com/99dj464r56-cloud/HealthTrend-trial)（只含编译网页、OCR 运行时与合成数据，无源码历史与个人种子）
- 新网址使用独立浏览器存储；旧网址资料不会自动迁移，请先从原设备导出备份。
- 设计／计划：`docs/superpowers/`
- 隐私约定：`PRIVACY.md`
- Mac 桌面版 / Mac app：[下载 Download `HealthTrend-mac.zip`](https://github.com/99dj464r56-cloud/HealthTrend-/releases/latest/download/HealthTrend-mac.zip)（[Releases](https://github.com/99dj464r56-cloud/HealthTrend-/releases)；未签名公证，首次请右键 → 打开 / unsigned: right-click → Open）

## 安全注意

- 公开构建与分享包**不得**包含 `public/seeds/personal-backup.json` 或任何真实病历。
- 演示数据仅为合成样本；截图不含真实姓名／药名／生日。
- 旧版恢复口令请勿写进仓库或截图；新安装不再需要 App 密码。

## 作者 / Author

vimi

## License

仅供个人／课程作业使用；请勿把他人健康资料提交到公开仓库。
