import { renderIndicatorChart } from '../charts/chartSvg';
import type { ChartSeries } from '../charts/series';
import type { ReportModel } from './reportModel';
import { formatRegimenStageSummary, knownMonitoringHintForMedication } from '../import/medicationPackaging';
import './print.css';

function html<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

function cell(row: HTMLTableRowElement, value: string, heading = false): void {
  const element = document.createElement(heading ? 'th' : 'td');
  element.textContent = value;
  row.append(element);
}

function period(stage: { startDate: string | null; endDate: string | null }): string {
  const end = stage.endDate ?? '仍使用';
  if (stage.startDate) return `${stage.startDate} – ${end}`;
  return end;
}

function createMedicationSummary(model: ReportModel): HTMLElement {
  const section = html('section', 'report-medications');
  const title = html('h2');
  title.textContent = '当前药单 / Current medications';
  section.append(title);
  if (!model.medications.length) {
    const empty = html('p', 'report-note');
    empty.textContent = '尚未录入药物资料 / No medications entered.';
    section.append(empty);
    return section;
  }
  const intro = html('p', 'report-note');
  intro.textContent = '一张表同时列出药物名称、当前用法与关联观察指标；不再另附重复的“全部用药阶段”清单。阶段为中性时间记录，不表示因果关系或剂量建议。';
  section.append(intro);
  const wrapper = html('div', 'report-table-wrap');
  const table = html('table', 'report-table');
  const header = html('tr');
  ['药物名称 / Medication', '当前用法 / Label instructions', '主要观察指标 / Related monitoring']
    .forEach((label) => cell(header, label, true));
  const thead = html('thead');
  thead.append(header);
  table.append(thead);
  const tbody = html('tbody');
  for (const rowModel of model.medications) {
    const row = html('tr');
    cell(row, `${rowModel.medication.nameZh} / ${rowModel.medication.nameEn}`);
    // Prefer current (open-ended) stage; otherwise join unique stage summaries once.
    const openStages = rowModel.stages.filter((stage) => stage.endDate === null);
    const stagesForLabel = openStages.length ? openStages : rowModel.stages;
    const stageText = stagesForLabel.length
      ? stagesForLabel.map((stage) => formatRegimenStageSummary(stage)).join('； ')
      : '用法未录入';
    cell(row, stageText);
    const linkedFromIds = rowModel.medication.linkedIndicatorIds;
    const linkedNames = linkedFromIds.length
      ? linkedFromIds.map((id) => {
        const hit = model.categories.flatMap((group) => group.series).find((series) => series.indicatorId === id);
        return hit ? `${hit.nameZh} / ${hit.nameEn}` : null;
      }).filter((item): item is string => Boolean(item))
      : model.categories.flatMap((group) => group.series
        .filter((series) => series.medications.some((item) => item.medicationId === rowModel.medication.id))
        .map((series) => `${series.nameZh} / ${series.nameEn}`));
    const uniqueLinks = [...new Set(linkedNames)];
    const monitoring = uniqueLinks.length
      ? uniqueLinks.join('；')
      : (rowModel.medication.monitoringNote?.trim()
        || knownMonitoringHintForMedication(rowModel.medication)
        || '未关联 / Not linked');
    cell(row, monitoring);
    tbody.append(row);
  }
  table.append(tbody);
  wrapper.append(table);
  section.append(wrapper);
  return section;
}

function createReportTextSection(model: ReportModel): HTMLElement {
  const section = html('section', 'report-text-section');
  section.dataset.reportText = 'true';
  const title = html('h2');
  title.textContent = '报告文字结论与建议 / Report text (confirmed verbatim)';
  section.append(title);
  if (!model.reportTextSections.length) {
    const empty = html('p', 'report-note');
    empty.textContent = '暂无已确认的报告文字。未核对的 OCR 文本不会出现在此。';
    section.append(empty);
    return section;
  }
  for (const group of model.reportTextSections) {
    const block = html('article', 'report-text-block');
    const heading = html('h3');
    heading.textContent = group.title;
    block.append(heading);
    for (const item of group.blocks) {
      const meta = html('p', 'report-text-meta');
      meta.textContent = [
        item.reportName,
        item.reportDate ?? '报告日期未知',
        item.laboratory ?? '机构未记录',
        item.pageNumber ? `第 ${item.pageNumber} 页` : '页码未记录',
        item.kind === 'user-note' ? '用户备注' : '原文',
      ].join(' · ');
      const body = html('pre', 'report-text-body');
      body.textContent = item.body;
      block.append(meta, body);
    }
    if (group.truncated) {
      const notice = html('p', 'report-note');
      notice.dataset.truncatedNotice = 'true';
      notice.textContent = '部分段落较长，已分页提示截断；完整原文仍保存在本机记录中，未经 AI 改写。';
      block.append(notice);
    }
    section.append(block);
  }
  return section;
}


function chartCard(series: ChartSeries, priority: boolean): HTMLElement {
  const card = html('article', `chart-card${priority ? ' priority-card' : ''}`);
  const heading = html('h3', 'chart-title');
  const chinese = html('span');
  chinese.textContent = series.nameZh;
  const english = html('span', 'chart-title-en');
  english.textContent = series.nameEn;
  heading.append(chinese, english);
  const unit = html('span', 'chart-unit');
  unit.textContent = `单位 / Unit: ${series.unit}`;
  const purpose = html('p', 'chart-purpose');
  purpose.textContent = `${series.purposeZh} / ${series.purposeEn}`;
  card.append(heading, unit, purpose, renderIndicatorChart(series));

  const medicines = html('div', 'chart-medications');
  const medTitle = html('strong');
  medTitle.textContent = '关联用药阶段 / Linked regimen stages (neutral)';
  medicines.append(medTitle);
  if (!series.medications.length) {
    const noMedicine = html('span');
    noMedicine.textContent = ' 未关联 / None recorded';
    medicines.append(noMedicine);
  } else {
    for (const medication of series.medications) {
      const item = html('p');
      item.textContent = `${medication.nameZh} / ${medication.nameEn} · ${medication.summary} · ${period(medication)}`;
      medicines.append(item);
    }
  }
  card.append(medicines);
  return card;
}

function chartSection(titleText: string, description: string, series: ChartSeries[], priority: boolean): HTMLElement {
  const section = html('section', `chart-section${priority ? ' priority-section' : ' category-section'}`);
  const heading = html('header', 'chart-section-heading');
  const title = html('h2');
  title.textContent = titleText;
  const note = html('p');
  note.textContent = description;
  heading.append(title, note);
  section.append(heading);
  const grid = html('div', 'chart-grid');
  if (!series.length) {
    const empty = html('p', 'report-note');
    empty.textContent = '此分类暂无指标 / No indicators in this group.';
    grid.append(empty);
  } else {
    series.forEach((item) => grid.append(chartCard(item, priority)));
  }
  section.append(grid);
  return section;
}

export interface PrintViewActions {
  onPrint(): void;
  onBack(): void;
}


export function createProvenanceAppendix(model: ReportModel): HTMLElement {
  const section = html('section', 'report-provenance');
  section.dataset.provenanceAppendix = 'true';
  const title = html('h2');
  title.textContent = '附录：资料来源与可追溯信息 / Provenance appendix';
  section.append(title);

  const meta = html('p', 'report-note');
  const p = model.provenance;
  meta.textContent = [
    `模板 / Template: ${p.templateId}@${p.templateVersion}`,
    `数据 schema / Schema: v${p.schemaVersion}`,
    `生成日期 / Generated: ${p.generatedAt}`,
    `原始文件留存 / Original files retained: ${p.originalFilesRetained ? '是' : '否（默认不留存）'}`,
  ].join(' · ');
  section.append(meta);

  const notesTitle = html('h3');
  notesTitle.textContent = '修订与确认说明 / Revision notes';
  section.append(notesTitle);
  const notes = html('ul', 'provenance-notes');
  for (const note of p.revisionNotes) {
    const li = html('li');
    li.textContent = note;
    notes.append(li);
  }
  section.append(notes);

  const sourcesTitle = html('h3');
  sourcesTitle.textContent = '来源文件 / Source files';
  section.append(sourcesTitle);
  if (!p.sources.length) {
    const empty = html('p', 'report-note');
    empty.textContent = '无已登记来源文件（手动录入或来源未关联）。';
    section.append(empty);
  } else {
    const table = html('table', 'report-table');
    const head = html('tr');
    ['文件名', '类型', '导入时间', '页数'].forEach((label) => cell(head, label, true));
    const thead = html('thead');
    thead.append(head);
    table.append(thead);
    const tbody = html('tbody');
    for (const source of p.sources) {
      const tr = html('tr');
      cell(tr, source.fileName);
      cell(tr, source.type);
      cell(tr, source.importedAt);
      cell(tr, source.pageCount === null ? '—' : String(source.pageCount));
      tbody.append(tr);
    }
    table.append(tbody);
    const wrap = html('div', 'report-table-wrap');
    wrap.append(table);
    section.append(wrap);
  }

  const obsTitle = html('h3');
  obsTitle.textContent = '观察值来源与确认状态 / Observation provenance';
  section.append(obsTitle);
  if (!p.observations.length) {
    const empty = html('p', 'report-note');
    empty.textContent = '暂无已确认观察值。';
    section.append(empty);
  } else {
    const table = html('table', 'report-table');
    const head = html('tr');
    ['指标', '日期', '来源文件', '页码', '确认', '范围来源', '实验室'].forEach((label) => cell(head, label, true));
    const thead = html('thead');
    thead.append(head);
    table.append(thead);
    const tbody = html('tbody');
    for (const row of p.observations.slice(0, 120)) {
      const tr = html('tr');
      cell(tr, row.indicatorNameZh);
      cell(tr, row.date);
      cell(tr, row.sourceFileName ?? '—');
      cell(tr, row.pageNumber === null ? '—' : String(row.pageNumber));
      cell(tr, row.confirmed ? '已确认' : '未确认');
      cell(tr, row.rangeProvenance);
      cell(tr, row.laboratory ?? '—');
      tbody.append(tr);
    }
    table.append(tbody);
    const wrap = html('div', 'report-table-wrap');
    wrap.append(table);
    section.append(wrap);
    if (p.observations.length > 120) {
      const more = html('p', 'report-note');
      more.textContent = `另有 ${p.observations.length - 120} 条观察值未在表中展开（已保存在本机记录）。`;
      section.append(more);
    }
  }

  const counts = html('p', 'report-note');
  counts.textContent = `已确认报告文字 ${p.reportTextCount} 段。`;
  section.append(counts);
  return section;
}

export function createPrintView(model: ReportModel, actions: PrintViewActions): HTMLElement {
  const root = html('main', 'print-report');
  root.dataset.reportRoot = 'true';
  const toolbar = html('nav', 'print-controls');
  const back = html('button', 'secondary-button');
  back.type = 'button';
  back.textContent = '返回资料 / Back';
  back.addEventListener('click', actions.onBack);
  const print = html('button', 'primary-button');
  print.type = 'button';
  print.textContent = '打印 / 保存为 PDF';
  print.addEventListener('click', actions.onPrint);
  toolbar.append(back, print);

  const header = html('header', 'report-header');
  const title = html('h1');
  title.textContent = model.title;
  const subject = html('p', 'report-subject');
  subject.dataset.profileSubject = 'true';
  subject.textContent = model.profileDisplayName
    ? `档案所属 / Record for: ${model.profileDisplayName}`
    : '档案所属 / Record for: （未设置显示名）';
  const date = html('p', 'report-created');
  date.textContent = `生成日期 / Generated: ${model.createdDate}`;
  const disclaimer = html('p', 'report-disclaimer');
  disclaimer.textContent = '本报告仅整理已录入资料，不提供诊断或治疗建议；药物与指标的并列仅供记录对照，不代表因果关系。参考范围以对应检查报告为准。';
  header.append(title, subject, date, disclaimer);
  const isDemo = /示范用户|Demo User/i.test(model.profileDisplayName);
  if (isDemo) {
    const demoBanner = html('p', 'demo-banner');
    demoBanner.dataset.demoBanner = 'true';
    demoBanner.textContent = '示范数据 · 非真实病历 / DEMO — synthetic sample for layout reference only';
    header.append(demoBanner);
  }
  root.append(toolbar, header, createMedicationSummary(model), createReportTextSection(model));

  root.append(chartSection('第一类：必须关注的重要指标 / Priority indicators', '每项指标单独呈现；虚线标出录入的报告参考上下限，红色箭头仅表示数值超出已录入范围。用药色条为中性时间标记。', model.priorityIndicators, true));
  for (const category of model.categories) {
    root.append(chartSection(`相关指标分类 / Category: ${category.category}`, '本分类中的每个指标均使用独立趋势图；不同单位的数值分开显示。', category.series, false));
  }

  // Provenance stays in the record; omit appendix from printed/PDF report.

  const footer = html('footer', 'report-footer');
  footer.textContent = [
    `趋势仅代表已录入数据；空白参考限表示原始资料未提供或未录入。请以医生和原始报告为准。`,
    `模板 ${model.provenance.templateId}@${model.provenance.templateVersion} · schema v${model.provenance.schemaVersion}`,
  ].join(' ');
  root.append(footer);
  return root;
}
