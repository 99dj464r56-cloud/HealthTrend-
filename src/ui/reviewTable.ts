import type { HealthRecord, Indicator, Observation } from '../domain/types';
import { formatRegimenStageSummary } from '../import/medicationPackaging';

function createAction(label: string, action: string, id: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'text-button';
  button.dataset.action = action;
  button.dataset.id = id;
  button.setAttribute('aria-label', label);
  button.textContent = label.split(' ')[0] ?? label;
  return button;
}

function createCell(text: string): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.textContent = text;
  return cell;
}

function createEmptyMessage(message: string): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.className = 'empty-list';
  paragraph.textContent = message;
  return paragraph;
}

function createTable(headers: string[]): { table: HTMLTableElement; body: HTMLTableSectionElement } {
  const table = document.createElement('table');
  table.className = 'records-table';
  const head = table.createTHead().insertRow();
  for (const title of headers) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = title;
    head.append(cell);
  }
  return { table, body: table.createTBody() };
}

function sectionTitle(title: string): HTMLHeadingElement {
  const heading = document.createElement('h3');
  heading.textContent = title;
  return heading;
}

function medicationTable(record: HealthRecord): HTMLElement {
  const section = document.createElement('section');
  section.className = 'review-section';
  section.append(sectionTitle('药物清单 / Medication list'));
  if (record.medications.length === 0) {
    section.append(createEmptyMessage('目前没有药物'));
    return section;
  }
  const { table, body } = createTable(['药物 / Medication', '用药阶段 / Stages', '关联指标 / Linked indicators', '操作 / Actions']);
  for (const medication of record.medications) {
    const row = body.insertRow();
    row.append(createCell(`${medication.nameZh} / ${medication.nameEn}`));
    const stages = record.regimenStages.filter((stage) => stage.medicationId === medication.id);
    const stageText = stages.length
      ? stages.map((stage) => {
        const start = stage.startDate ?? '开始未知';
        const end = stage.endDate ?? '结束未知';
        return `${formatRegimenStageSummary(stage)} (${start}–${end})`;
      }).join('； ')
      : '尚无阶段';
    row.append(createCell(stageText));
    const links = medication.linkedIndicatorIds.map((id) => record.indicators.find((indicator) => indicator.id === id)).filter((item): item is Indicator => Boolean(item));
    row.append(createCell(links.map((indicator) => `${indicator.nameZh} / ${indicator.nameEn}`).join('、') || '—'));
    const actions = document.createElement('td');
    actions.className = 'actions-cell';
    actions.append(
      createAction(`编辑药物 ${medication.nameZh}`, 'edit-medication', medication.id),
      createAction(`添加阶段 ${medication.nameZh}`, 'add-regimen-stage', medication.id),
      createAction(`删除药物 ${medication.nameZh}`, 'delete-medication', medication.id),
    );
    row.append(actions);
  }
  section.append(table);

  if (record.regimenStages.length) {
    const stageHeading = document.createElement('h4');
    stageHeading.textContent = '全部用药阶段 / All regimen stages';
    section.append(stageHeading);
    const stageTable = createTable(['药物', '摘要', '期间', '操作']);
    for (const stage of record.regimenStages) {
      const medication = record.medications.find((item) => item.id === stage.medicationId);
      const row = stageTable.body.insertRow();
      row.append(createCell(medication ? `${medication.nameZh} / ${medication.nameEn}` : stage.medicationId));
      row.append(createCell(formatRegimenStageSummary(stage)));
      row.append(createCell(`${stage.startDate ?? '开始未知'} – ${stage.endDate ?? '结束未知'}`));
      const actions = document.createElement('td');
      actions.className = 'actions-cell';
      actions.append(
        createAction(`编辑阶段 ${stage.id}`, 'edit-regimen-stage', stage.id),
        createAction(`删除阶段 ${stage.id}`, 'delete-regimen-stage', stage.id),
      );
      row.append(actions);
    }
    section.append(stageTable.table);
  }
  return section;
}

function reportTextSection(record: HealthRecord): HTMLElement {
  const section = document.createElement('section');
  section.className = 'review-section';
  section.append(sectionTitle('报告文字 / Report text'));
  if (!record.reportTextBlocks.length) {
    section.append(createEmptyMessage('目前没有已确认的报告文字'));
    return section;
  }
  const { table, body } = createTable(['报告', '段落', '性质', '摘要', '操作']);
  for (const block of record.reportTextBlocks) {
    const row = body.insertRow();
    row.append(createCell(`${block.reportName}${block.reportDate ? ` · ${block.reportDate}` : ''}`));
    row.append(createCell(block.sectionTitle));
    row.append(createCell(block.kind === 'user-note' ? '用户备注' : '原文'));
    row.append(createCell(block.body.slice(0, 80)));
    const actions = document.createElement('td');
    actions.className = 'actions-cell';
    actions.append(
      createAction(`编辑文字 ${block.id}`, 'edit-report-text', block.id),
      createAction(`删除文字 ${block.id}`, 'delete-report-text', block.id),
    );
    row.append(actions);
  }
  section.append(table);
  return section;
}

function formatObservationResult(observation: Observation): string {
  const rangeBits: string[] = [];
  if (observation.lowerLimit !== null) rangeBits.push(`下限 ${observation.lowerLimit}`);
  if (observation.upperLimit !== null) rangeBits.push(`上限 ${observation.upperLimit}`);
  const rangeText = rangeBits.length
    ? ` · ${rangeBits.join(' / ')} (${observation.rangeProvenance})`
    : ` · 范围未提供 (${observation.rangeProvenance})`;
  return `${observation.rawValue} ${observation.unit}${rangeText}`;
}

function observationRow(observation: Observation): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.append(createCell(observation.date), createCell(formatObservationResult(observation)));
  const actions = document.createElement('td');
  actions.className = 'actions-cell';
  actions.append(
    createAction(`编辑结果 ${observation.date}`, 'edit-observation', observation.id),
    createAction(`删除结果 ${observation.date}`, 'delete-observation', observation.id),
  );
  row.append(actions);
  return row;
}

function indicatorCard(indicator: Indicator, record: HealthRecord): HTMLElement {
  const card = document.createElement('article');
  card.className = 'indicator-record';
  const title = document.createElement('h4');
  title.textContent = `${indicator.nameZh} / ${indicator.nameEn}`;
  const purpose = document.createElement('p');
  purpose.className = 'indicator-purpose';
  purpose.textContent = `用途：${indicator.purposeZh} / ${indicator.purposeEn}`;
  const metadata = document.createElement('p');
  metadata.className = 'indicator-metadata';
  const lower = indicator.lowerLimit === null ? '未提供' : String(indicator.lowerLimit);
  const upper = indicator.upperLimit === null ? '未提供' : String(indicator.upperLimit);
  metadata.textContent = `${indicator.category} · 单位 ${indicator.unit} · 新建默认下限 ${lower} · 新建默认上限 ${upper}${indicator.priority ? ' · 重点关注' : ''}（历史异常判定以各次结果自身范围为准）`;
  const actions = document.createElement('div');
  actions.className = 'record-actions';
  actions.append(
    createAction(`编辑指标 ${indicator.nameZh}`, 'edit-indicator', indicator.id),
    createAction(`删除指标 ${indicator.nameZh}`, 'delete-indicator', indicator.id),
  );
  const addResult = document.createElement('button');
  addResult.type = 'button';
  addResult.className = 'text-button';
  addResult.dataset.action = 'add-observation';
  addResult.dataset.id = indicator.id;
  addResult.textContent = '添加检查结果';
  actions.append(addResult);
  card.append(title, purpose, metadata, actions);

  const observations = record.observations.filter((observation) => observation.indicatorId === indicator.id).sort((a, b) => a.date.localeCompare(b.date));
  if (observations.length === 0) {
    card.append(createEmptyMessage('暂无已确认结果'));
    return card;
  }
  const { table, body } = createTable(['检查日期 / Date', `结果 / Result (${indicator.unit})`, '操作 / Actions']);
  observations.forEach((observation) => body.append(observationRow(observation)));
  card.append(table);
  return card;
}

export function createReviewTable(record: HealthRecord): HTMLElement {
  const root = document.createElement('div');
  root.className = 'review-lists';
  root.append(medicationTable(record));
  root.append(reportTextSection(record));
  const indicatorSection = document.createElement('section');
  indicatorSection.className = 'review-section';
  indicatorSection.append(sectionTitle('检查指标 / Lab indicators'));
  if (record.indicators.length === 0) indicatorSection.append(createEmptyMessage('目前没有已确认的检查指标'));
  for (const indicator of [...record.indicators].sort((a, b) => a.category.localeCompare(b.category) || a.nameEn.localeCompare(b.nameEn))) {
    indicatorSection.append(indicatorCard(indicator, record));
  }
  root.append(indicatorSection);
  return root;
}
