import type { AppleHealthRecord, HealthRecord, Source } from '../domain/types';
import { buildAppleHealthPreview, previewRowsToRecords, type AppleHealthPreviewSummary } from '../import/appleHealth/preview';
import { loadAppleHealthExportFile } from '../import/appleHealth/parseExport';
import { listSupportedAppleHealthTypesForUi, SUPPORTED_QUANTITY_TYPES } from '../import/appleHealth/supported';
import { AppleHealthXmlError } from '../import/appleHealth/safeXml';

export interface AppleHealthCommitPayload {
  records: AppleHealthRecord[];
  source: Source;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function formatSummary(summary: AppleHealthPreviewSummary): string {
  return [
    `来源文件：${summary.sourceFileName}`,
    `日期范围：${summary.dateRange.min ?? '—'} ~ ${summary.dateRange.max ?? '—'}`,
    `将导入 ${summary.willImport} · 重复 ${summary.duplicate} · 冲突 ${summary.conflict} · 筛选排除 ${summary.filtered} · 不支持/跳过 ${summary.unsupported}`,
    '取消不会写入任何候选项。确认前不会进入图表或 PDF。',
  ].join('\n');
}

/**
 * In-browser Apple Health export import panel.
 * Candidates stay in memory until confirm; cancel clears them.
 */
export function createAppleHealthImportPanel(
  getRecord: () => HealthRecord | null,
  onCommit: (payload: AppleHealthCommitPayload) => Promise<void>,
): HTMLElement {
  const section = el('section', 'form-panel apple-health-panel');
  const heading = el('h3');
  heading.textContent = '导入 Apple 健康数据（手动 XML/ZIP）';
  const note = el('p', 'form-help');
  note.textContent = '本机解析 iPhone 健康导出（XML/ZIP）。';
  const supported = el('details');
  const summary = el('summary');
  summary.textContent = '支持的数据类型';
  const list = el('ul');
  for (const item of listSupportedAppleHealthTypesForUi()) {
    const li = el('li');
    li.textContent = item;
    list.append(li);
  }
  supported.append(summary, list);

  const fileLabel = el('label', 'secondary-button file-button');
  fileLabel.textContent = '选择 export.xml 或 ZIP';
  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = '.xml,.zip,text/xml,application/xml,application/zip';
  fileLabel.append(fileInput);

  const filters = el('div', 'apple-health-filters');
  const kindSample = checkbox('kind-sample', '数值样本 Record', true);
  const kindWorkout = checkbox('kind-workout', '训练 Workout', true);
  const kindSummary = checkbox('kind-summary', '每日摘要 ActivitySummary', true);
  const dateFrom = labeledInput('开始日期', 'apple-date-from', 'date');
  const dateTo = labeledInput('结束日期', 'apple-date-to', 'date');
  const includeConflicts = checkbox('apple-include-conflicts', '冲突项也导入（需确认）', false);
  filters.append(kindSample.label, kindWorkout.label, kindSummary.label, dateFrom.wrap, dateTo.wrap, includeConflicts.label);

  const previewBox = el('pre', 'apple-health-preview');
  previewBox.textContent = '尚未选择文件。';
  const sampleTable = el('div', 'apple-health-sample-rows');
  const error = el('p', 'form-error');
  error.hidden = true;

  const actions = el('div', 'form-actions');
  const confirmBtn = el('button', 'primary-button');
  confirmBtn.type = 'button';
  confirmBtn.textContent = '确认导入所选数据';
  confirmBtn.disabled = true;
  const cancelBtn = el('button', 'secondary-button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = '取消并清空候选项';
  cancelBtn.disabled = true;
  actions.append(confirmBtn, cancelBtn);

  let preview: AppleHealthPreviewSummary | null = null;
  let parsedSourceName = '';

  const clearCandidates = (): void => {
    preview = null;
    parsedSourceName = '';
    previewBox.textContent = '候选项已清空。取消不会保存任何 Apple 健康数据。';
    sampleTable.replaceChildren();
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    fileInput.value = '';
  };

  let lastParsed: Awaited<ReturnType<typeof loadAppleHealthExportFile>> | null = null;

  const refreshFromFilters = (): void => {
    if (!lastParsed) return;
    const record = getRecord();
    preview = buildAppleHealthPreview(lastParsed, record?.appleHealthRecords ?? [], {
      kinds: new Set([
        ...(kindSample.input.checked ? ['sample' as const] : []),
        ...(kindWorkout.input.checked ? ['workout' as const] : []),
        ...(kindSummary.input.checked ? ['activitySummary' as const] : []),
      ]),
      typeIdentifiers: new Set([...SUPPORTED_QUANTITY_TYPES, 'Workout', 'ActivitySummary']),
      dateFrom: dateFrom.input.value || null,
      dateTo: dateTo.input.value || null,
    });
    previewBox.textContent = formatSummary(preview);
    sampleTable.replaceChildren();
    const table = el('table', 'records-table');
    const head = table.createTHead().insertRow();
    for (const title of ['状态', '类型', '日期', '值', '来源']) {
      const th = document.createElement('th');
      th.textContent = title;
      head.append(th);
    }
    const body = table.createTBody();
    for (const row of preview.rows.filter((item) => item.status !== 'filtered').slice(0, 25)) {
      const tr = body.insertRow();
      for (const value of [
        row.status,
        row.typeIdentifier,
        row.localDate,
        row.value === null ? '—' : `${row.value}${row.unit ? ` ${row.unit}` : ''}`,
        row.sourceName ?? '—',
      ]) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
    }
    sampleTable.append(table);
    confirmBtn.disabled = preview.willImport + (includeConflicts.input.checked ? preview.conflict : 0) <= 0;
    cancelBtn.disabled = false;
  };

  fileInput.addEventListener('change', () => {
    void (async () => {
      error.hidden = true;
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        lastParsed = await loadAppleHealthExportFile(file);
        parsedSourceName = file.name;
        refreshFromFilters();
      } catch (err) {
        clearCandidates();
        lastParsed = null;
        error.hidden = false;
        error.textContent = err instanceof Error ? err.message : '无法解析 Apple 健康导出文件。';
      }
    })();
  });

  for (const input of [kindSample.input, kindWorkout.input, kindSummary.input, dateFrom.input, dateTo.input, includeConflicts.input]) {
    input.addEventListener('change', () => refreshFromFilters());
  }

  cancelBtn.addEventListener('click', () => {
    lastParsed = null;
    clearCandidates();
  });

  confirmBtn.addEventListener('click', () => {
    void (async () => {
      if (!preview || !lastParsed) return;
      const record = getRecord();
      if (!record?.profile.identityConfirmed) {
        error.hidden = false;
        error.textContent = '请先确认档案身份，再导入 Apple 健康数据。';
        return;
      }
      const sourceId = crypto.randomUUID();
      const importedAt = new Date().toISOString();
      const records = previewRowsToRecords(preview.rows, {
        includeConflicts: includeConflicts.input.checked,
        sourceFileId: sourceId,
        importedAt,
      });
      if (!records.length) {
        error.hidden = false;
        error.textContent = '没有可导入的记录。';
        return;
      }
      const source: Source = {
        id: sourceId,
        fileName: parsedSourceName || preview.sourceFileName,
        type: 'apple-health',
        importedAt,
        pageCount: null,
      };
      try {
        await onCommit({ records, source });
        lastParsed = null;
        clearCandidates();
      } catch (err) {
        error.hidden = false;
        error.textContent = err instanceof Error ? err.message : '保存失败。';
      }
    })();
  });

  section.append(heading, note, supported, fileLabel, filters, previewBox, sampleTable, error, actions);
  return section;
}

function checkbox(id: string, labelText: string, checked: boolean): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = el('label', 'checkbox-field');
  const input = el('input');
  input.type = 'checkbox';
  input.id = id;
  input.checked = checked;
  const span = el('span');
  span.textContent = labelText;
  label.append(input, span);
  return { label, input };
}

function labeledInput(caption: string, id: string, type: string): { wrap: HTMLLabelElement; input: HTMLInputElement } {
  const wrap = el('label', 'form-field');
  const span = el('span');
  span.textContent = caption;
  const input = el('input');
  input.id = id;
  input.type = type;
  wrap.append(span, input);
  return { wrap, input };
}

export { AppleHealthXmlError };
