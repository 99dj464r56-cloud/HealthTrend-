# Health Trend PDF

一个纯静态网页工具：在浏览器本机整理药物与体检指标，查看分组趋势，并通过浏览器的“打印 / 保存为 PDF”生成双语 A4 横向报告。界面中“重要指标”单独列出；其余指标按检查类别分组，每个指标各有一张图。

## 使用

打开部署好的网页后：

1. 手动录入药物、剂量、用法和检查指标，或选择/拍摄 JPG、PNG、WebP 照片，或导入 PDF。
2. 等待本机识别。每份文件最多 20 MB；PDF 最多 20 页。扫描版 PDF 会逐页 OCR。
3. 对照原始资料检查识别草稿，补齐名称、日期、单位、分类和用途，再逐条确认。没有识别出的药物资料可以在药物表单中手动录入；不要把包装上的药物规格当作化验结果。
4. 为药物关联需要一起观察的指标，并填写用药剂量/期间。该并列只用于记录对照，不推断药物与指标变化存在因果关系。
5. 选择“预览趋势报告 / PDF”，检查报告，再选择“打印 / 保存为 PDF”。
6. 使用 JSON 备份/恢复，在更换浏览器或设备前保存、搬移自己的记录。

参考上下限来自用户录入的原始报告；空白限值不会自动套用通用标准。图表显示报告日期（含年份）和最近三次的日期/数值；低于或高于已录入限值时，以红色和箭头标示。若报告没有数据，图表会明确显示空状态，而不是伪造趋势。

## 隐私与限制

- 应用不设账号、后端数据库、分析或上传接口。记录只保存在当前浏览器的 IndexedDB；原始照片/PDF和原始 OCR 文本不会被保存，只有人工核对后确认的字段进入记录。
- PDF 解析和图像 OCR 都在浏览器本机运行。首次 OCR 会从当前网页所在的静态站点下载 PDF/OCR worker、WebAssembly 和中英文语言模型，合计约 36 MiB；模型可在浏览器缓存。此后只请求同源静态资源，不会把报告内容发送给这些请求。
- 文件上限为 20 MB，PDF 上限为 20 页。HEIC/TIFF 当前需先转换为 JPG/PNG。OCR 不可靠时可改为手动录入；必须对照原报告核对所有值、单位、日期和范围。
- 清理浏览器站点数据可能删除记录。JSON 备份包含敏感健康资料，请妥善保管。
- 本工具只用于个人资料整理，不提供诊断或治疗建议，也不能替代医生或原始检查报告。

详见 [隐私说明](PRIVACY.md)、[安全政策](SECURITY.md) 和 [第三方组件说明](THIRD_PARTY_NOTICES.md)。

## 本机开发

需要 Node.js 22 或更新版本。

```sh
npm ci
npm run dev
npm test
npm run build
npm run audit:public
npm run preview
```

`npm run build` 会从锁定的 npm 包复制同源 OCR runtime 资产到被忽略的 `public/ocr/`，再构建 `dist/`；不要把语言模型或用户资料提交到 Git。发布前可用：

```sh
npm run test:release
```

GitHub Pages 的项目子路径由部署工作流设置为 `/health-trend-pdf/`。本机可用 `VITE_BASE_PATH=/health-trend-pdf/ npm run build` 验证同类子路径。

## 技术与许可

Vite + TypeScript；IndexedDB 本机记录；PDF.js 抽取文字；Tesseract.js 中英文 OCR；SVG 折线图；浏览器打印生成 PDF。项目代码使用 MIT 许可。第三方库与语言数据的许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
