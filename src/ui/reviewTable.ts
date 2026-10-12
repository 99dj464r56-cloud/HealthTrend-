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
  section.append(sectionTitle('当前药单 / Current medications'));
  const help = document.createElement('p');
  help.className = 'muted';
  help.textContent = '点「添加阶段」或「编辑用法」打开下方表单。结束日期留空表示仍使用；保存后日期会显示在用法摘要中。';
  section.append(help);
  if (record.medications.length === 0) {
    section.append(createEmptyMessage('目前没有药物'));
    return section;
  }
  const { table, body } = createTable(['药物 / Medication', '当前用法 / Instructions', '关联指标 / Linked', '操作 / Actions']);
  for (const medication of record.medications) {
    const row = body.insertRow();
    row.append(createCell(`${medication.nameZh} / ${medication.nameEn}`));
    const stages = record.regimenStages.filter((stage) => stage.medicationId === medication.id);
    const open = stages.filter((stage) => stage.endDate === null);
    const shown = open.length ? open : stages;
    const stageCell = document.createElement('td');
    if (!shown.length) {
      stageCell.textContent = '尚无阶段';
    } else {
      for (const stage of shown) {
        const line = document.createElement('div');
        line.className = 'stage-line';
        const label = document.createElement('span');
        label.textContent = formatRegimenStageSummary(stage);
        const edit = createAction('编辑用法', 'edit-regimen-stage', stage.id);
        const del = createAction('删除用法', 'delete-regimen-stage', stage.id);
        line.append(label, edit, del);
        stageCell.append(line);
      }
    }
    row.append(stageCell);
    const links = medication.linkedIndicatorIds.map((id) => record.indicators.find((indicator) => indicator.id === id)).filter((item): item is Indicator => Boolean(item));
    const linkText = links.map((indicator) => `${indicator.nameZh} / ${indicator.nameEn}`).join('、');
    row.append(createCell(linkText || medication.monitoringNote?.trim() || '—'));
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
