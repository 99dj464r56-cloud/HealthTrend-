import type { HealthRecord, Indicator, Observation } from '../domain/types';

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
  const { table, body } = createTable(['药物 / Medication', '规格 / Strength', '使用方法 / Instructions', '关联指标 / Linked indicators', '操作 / Actions']);
  for (const medication of record.medications) {
    const row = body.insertRow();
    row.append(createCell(`${medication.nameZh} / ${medication.nameEn}`));
    row.append(createCell(medication.strength));
    row.append(createCell(medication.instructions));
    const links = medication.linkedIndicatorIds.map((id) => record.indicators.find((indicator) => indicator.id === id)).filter((item): item is Indicator => Boolean(item));
    row.append(createCell(links.map((indicator) => `${indicator.nameZh} / ${indicator.nameEn}`).join('、') || '—'));
    const actions = document.createElement('td');
    actions.className = 'actions-cell';
    actions.append(
      createAction(`编辑药物 ${medication.nameZh}`, 'edit-medication', medication.id),
      createAction(`删除药物 ${medication.nameZh}`, 'delete-medication', medication.id),
    );
    row.append(actions);
  }
  section.append(table);
  return section;
}

function observationRow(observation: Observation): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.append(createCell(observation.date), createCell(`${observation.value} ${observation.unit}`));
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
  metadata.textContent = `${indicator.category} · 单位 ${indicator.unit} · 下限 ${lower} · 上限 ${upper}${indicator.priority ? ' · 重点关注' : ''}`;
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
