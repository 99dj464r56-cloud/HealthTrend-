/** Stable identifiers printed in the PDF provenance appendix. */
export const REPORT_TEMPLATE_ID = 'health-trend-pdf-report';
export const REPORT_TEMPLATE_VERSION = '0.1.0';
export const REPORT_DATA_SCHEMA_VERSION = 4 as const;

export const REPORT_REVISION_NOTES = [
  '仅包含用户确认后的结构化字段；OCR 草稿与未确认候选项不会进入 PDF。',
  '原始上传文件（照片／PDF）默认不留存；本附录只记录来源文件名与页码等元数据。',
  '观察值参考范围来自各次报告自身；migrated-unverified 表示由旧版指标层迁移，不能当作原报告区间。',
  '重要指标在“必须关注”区与所属类别区重复呈现为有意设计。',
] as const;
