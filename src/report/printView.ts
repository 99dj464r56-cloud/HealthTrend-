import { renderIndicatorChart } from '../charts/chartSvg';
import type { ChartSeries } from '../charts/series';
import type { ReportModel } from './reportModel';
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

function period(medicine: { startDate: string | null; endDate: string | null }): string {
  return `${medicine.startDate ?? '开始日期未记录'} - ${medicine.endDate ?? '仍在使用 / 未记录结束日期'}`;
}

function createMedicationSummary(model: ReportModel): HTMLElement {
  const section = html('section', 'report-medications');
  const title = html('h2');
  title.textContent = '用药记录 / Medication list';
  section.append(title);
  if (!model.medications.length) {
    const empty = html('p', 'report-note');
    empty.textContent = '尚未录入药物资料 / No medications entered.';
    section.append(empty);
    return section;
  }
  const wrapper = html('div', 'report-table-wrap');
  const table = html('table', 'report-table');
  const header = html('tr');
  ['中文名称 / Chinese', 'English name', '规格 / Dose', '使用方法 / Instructions', '使用期间 / Period', '关联指标 / Linked indicators']
    .forEach((label) => cell(header, label, true));
  const thead = html('thead');
  thead.append(header);
  table.append(thead);
  const tbody = html('tbody');
  for (const medication of model.medications) {
    const row = html('tr');
    cell(row, medication.nameZh);
    cell(row, medication.nameEn);
    cell(row, medication.strength);
    cell(row, medication.instructions);
    cell(row, period(medication));
    const linked = model.categories.flatMap((group) => group.series
      .filter((series) => series.medications.some((item) => item.id === medication.id))
      .map((series) => `${series.nameZh} / ${series.nameEn}`));
    cell(row, [...new Set(linked)].join('；') || '未关联 / Not linked');
    tbody.append(row);
  }
  table.append(tbody);
  wrapper.append(table);
  section.append(wrapper);
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
  medTitle.textContent = '关联用药 / Linked medicine';
  medicines.append(medTitle);
  if (!series.medications.length) {
    const noMedicine = html('span');
    noMedicine.textContent = ' 未关联 / None recorded';
    medicines.append(noMedicine);
  } else {
    for (const medication of series.medications) {
      const item = html('p');
      item.textContent = `${medication.nameZh} / ${medication.nameEn} · ${medication.strength} · ${medication.instructions} · ${period(medication)}`;
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
  const date = html('p', 'report-created');
  date.textContent = `生成日期 / Generated: ${model.createdDate}`;
  const disclaimer = html('p', 'report-disclaimer');
  disclaimer.textContent = '本报告仅整理已录入资料，不提供诊断或治疗建议；药物与指标的并列仅供记录对照，不代表因果关系。参考范围以对应检查报告为准。';
  header.append(title, date, disclaimer);
  root.append(toolbar, header, createMedicationSummary(model));

  root.append(chartSection('第一类：必须关注的重要指标 / Priority indicators', '每项指标单独呈现；虚线标出录入的报告参考上下限，红色箭头仅表示数值超出已录入范围。', model.priorityIndicators, true));
  for (const category of model.categories) {
    root.append(chartSection(`相关指标分类 / Category: ${category.category}`, '本分类中的每个指标均使用独立趋势图；不同单位的数值分开显示。', category.series, false));
  }

  const footer = html('footer', 'report-footer');
  footer.textContent = '趋势仅代表已录入数据；空白参考限表示原始资料未提供或未录入。请以医生和原始报告为准。';
  root.append(footer);
  return root;
}
