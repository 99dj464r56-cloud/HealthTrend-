import type {
  Indicator,
  Medication,
  MedicationRegimenStage,
  Observation,
  ReportTextBlock,
  ReportTextKind,
  ReportTextSection,
} from '../domain/types';

function inputField(form: HTMLFormElement, labelText: string, id: string, type = 'text', value = '', required = false): HTMLInputElement {
  const label = document.createElement('label');
  label.className = 'form-field';
  const caption = document.createElement('span');
  caption.textContent = labelText;
  const input = document.createElement('input');
  input.id = id;
  input.name = id;
  input.type = type;
  input.value = value;
  input.required = required;
  if (type === 'number') input.step = 'any';
  label.append(caption, input);
  form.append(label);
  return input;
}

function textAreaField(form: HTMLFormElement, labelText: string, id: string, value = '', required = true): HTMLTextAreaElement {
  const label = document.createElement('label');
  label.className = 'form-field form-field-wide';
  const caption = document.createElement('span');
  caption.textContent = labelText;
  const input = document.createElement('textarea');
  input.id = id;
  input.name = id;
  input.value = value;
  input.required = required;
  input.rows = 3;
  label.append(caption, input);
  form.append(label);
  return input;
}

function checkboxField(form: HTMLFormElement, labelText: string, id: string, checked = false): HTMLInputElement {
  const label = document.createElement('label');
  label.className = 'checkbox-field';
  const input = document.createElement('input');
  input.id = id;
  input.name = id;
  input.type = 'checkbox';
  input.checked = checked;
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(input, text);
  form.append(label);
  return input;
}

function selectField(
  form: HTMLFormElement,
  labelText: string,
  id: string,
  options: Array<{ value: string; label: string }>,
  value: string,
): HTMLSelectElement {
  const label = document.createElement('label');
  label.className = 'form-field';
  const caption = document.createElement('span');
  caption.textContent = labelText;
  const select = document.createElement('select');
  select.id = id;
  select.name = id;
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    if (option.value === value) node.selected = true;
    select.append(node);
  }
  label.append(caption, select);
  form.append(label);
  return select;
}

function submitButton(text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'primary-button';
  button.textContent = text;
  return button;
}

export function createMedicationForm(medication: Medication | null, indicators: Indicator[]): HTMLFormElement {
  const form = document.createElement('form');
  form.id = 'medication-form';
  form.className = 'edit-form';
  if (medication) form.dataset.itemId = medication.id;

  const heading = document.createElement('h3');
  heading.textContent = medication ? '编辑药物身份 / Edit medication identity' : '添加药物 / Add medication';
  form.append(heading);
  inputField(form, '中文药名', 'medication-name-zh', 'text', medication?.nameZh ?? '', true);
  inputField(form, 'English medication name', 'medication-name-en', 'text', medication?.nameEn ?? '', true);
  const help = document.createElement('p');
  help.className = 'form-help';
  help.textContent = '剂量与起止日期请在“用药阶段”中记录；编辑当前阶段不会删除历史阶段。';
  form.append(help);

  if (indicators.length) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'link-fieldset';
    const legend = document.createElement('legend');
    legend.textContent = '关联观察指标 / Related indicators';
    fieldset.append(legend);
    for (const indicator of indicators) {
      const label = document.createElement('label');
      label.className = 'checkbox-field';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'linkedIndicatorIds';
      input.value = indicator.id;
      input.checked = medication?.linkedIndicatorIds.includes(indicator.id) ?? false;
      const text = document.createElement('span');
      text.textContent = `${indicator.nameZh} / ${indicator.nameEn}`;
      label.append(input, text);
      fieldset.append(label);
    }
    form.append(fieldset);
  }

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  actions.append(submitButton('保存药物身份'));
  form.append(actions);
  return form;
}

export function createRegimenStageForm(
  medications: Medication[],
  stage: MedicationRegimenStage | null,
  defaultMedicationId: string | null = null,
): HTMLFormElement {
  const form = document.createElement('form');
  form.id = 'regimen-stage-form';
  form.className = 'edit-form';
  if (stage) form.dataset.itemId = stage.id;

  const heading = document.createElement('h3');
  heading.textContent = stage ? '编辑用药阶段 / Edit regimen stage' : '添加用药阶段 / Add regimen stage';
  form.append(heading);

  selectField(
    form,
    '所属药物',
    'stage-medication-id',
    medications.map((medication) => ({
      value: medication.id,
      label: `${medication.nameZh} / ${medication.nameEn}`,
    })),
    stage?.medicationId ?? defaultMedicationId ?? medications[0]?.id ?? '',
  );
  inputField(form, '规格（如 5 mg，不是包装数量）', 'stage-strength-label', 'text', stage?.strengthLabel ?? '', true);
  inputField(form, '单次剂量数量（如 1）', 'stage-dose-amount', 'text', stage?.doseAmount ?? '');
  inputField(form, '单次剂量单位（如 tablet / 片）', 'stage-dose-unit', 'text', stage?.doseUnit ?? '');
  inputField(form, '服用频率', 'stage-frequency', 'text', stage?.frequency ?? '', true);
  inputField(form, '剂型（可选）', 'stage-form', 'text', stage?.form ?? '');
  inputField(form, '包装数量（可选，如 200 tablets）', 'stage-pack-count', 'text', stage?.packCountLabel ?? '');
  inputField(form, '开始日期（可留空=未知）', 'stage-start-date', 'date', stage?.startDate ?? '');
  inputField(form, '结束日期（可留空=未知）', 'stage-end-date', 'date', stage?.endDate ?? '');
  const help = document.createElement('p');
  help.className = 'form-help';
  help.textContent = '包装数量与规格、单次剂量分开填写。切勿把“200 tablets”填成 200 mg。日期未知请留空；结束早于开始会被拒绝。';
  form.append(help);

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  actions.append(submitButton(stage ? '保存用药阶段' : '添加用药阶段（保留历史）'));
  form.append(actions);
  return form;
}

export function createReportTextForm(block: ReportTextBlock | null): HTMLFormElement {
  const form = document.createElement('form');
  form.id = 'report-text-form';
  form.className = 'edit-form';
  if (block) form.dataset.itemId = block.id;

  const heading = document.createElement('h3');
  heading.textContent = block ? '编辑报告文字 / Edit report text' : '确认报告文字 / Confirm report text';
  form.append(heading);
  inputField(form, '报告名称', 'report-text-name', 'text', block?.reportName ?? '', true);
  inputField(form, '报告日期', 'report-text-date', 'date', block?.reportDate ?? '');
  inputField(form, '机构 / 实验室', 'report-text-lab', 'text', block?.laboratory ?? '');
  inputField(form, '页码', 'report-text-page', 'number', block?.pageNumber ? String(block.pageNumber) : '');
  inputField(form, '段落标题', 'report-text-section-title', 'text', block?.sectionTitle ?? '', true);
  selectField(form, '段落类型', 'report-text-section-kind', [
    { value: 'findings', label: '检查所见 / Findings' },
    { value: 'conclusion', label: '结论 / Conclusion' },
    { value: 'advice', label: '报告建议 / Advice' },
    { value: 'other', label: '其他 / Other' },
  ], block?.sectionKind ?? 'findings');
  selectField(form, '文本性质', 'report-text-kind', [
    { value: 'verbatim', label: '原报告原文 / Verbatim' },
    { value: 'user-note', label: '用户备注 / User note' },
  ], block?.kind ?? 'verbatim');
  textAreaField(form, '正文（核对后原文，不会被 AI 改写）', 'report-text-body', block?.body ?? '', true);
  checkboxField(form, '我已对照原报告核对，确认写入本机记录', 'report-text-confirmed', block?.confirmed ?? false);
  const help = document.createElement('p');
  help.className = 'form-help';
  help.textContent = '未勾选确认的文字不会进入 PDF。重复导入相同报告段落会被检测。';
  form.append(help);
  const actions = document.createElement('div');
  actions.className = 'form-actions';
  actions.append(submitButton('保存已确认报告文字'));
  form.append(actions);
  return form;
}

export function createIndicatorForm(indicator: Indicator | null): HTMLFormElement {
  const form = document.createElement('form');
  form.id = 'indicator-form';
  form.className = 'edit-form';
  if (indicator) form.dataset.itemId = indicator.id;

  const heading = document.createElement('h3');
  heading.textContent = indicator ? '编辑指标 / Edit indicator' : '添加检查指标 / Add lab indicator';
  form.append(heading);
  inputField(form, '中文指标名称', 'indicator-name-zh', 'text', indicator?.nameZh ?? '', true);
  inputField(form, 'English indicator name', 'indicator-name-en', 'text', indicator?.nameEn ?? '', true);
  textAreaField(form, '中文用途', 'indicator-purpose-zh', indicator?.purposeZh ?? '');
  textAreaField(form, 'English purpose', 'indicator-purpose-en', indicator?.purposeEn ?? '');
  inputField(form, '分类', 'indicator-category', 'text', indicator?.category ?? '', true);
  inputField(form, '单位', 'indicator-unit', 'text', indicator?.unit ?? '', true);
  inputField(form, '新建结果默认下限（不改写历史）', 'indicator-lower-limit', 'number', indicator?.lowerLimit === null || indicator?.lowerLimit === undefined ? '' : String(indicator.lowerLimit));
  inputField(form, '新建结果默认上限（不改写历史）', 'indicator-upper-limit', 'number', indicator?.upperLimit === null || indicator?.upperLimit === undefined ? '' : String(indicator.upperLimit));
  checkboxField(form, '重点关注 / Priority indicator', 'indicator-priority', indicator?.priority ?? false);

  if (!indicator) {
    const note = document.createElement('p');
    note.className = 'form-help';
    note.textContent = '默认上下限仅用于新录入的这一条结果；历史结果各自保留自己的报告范围，不会被之后修改指标默认值而改写。可留空。可同时录入一条结果。';
    form.append(note);
    inputField(form, '检查日期', 'observation-date', 'date');
    inputField(form, '检查数值', 'observation-value', 'text');
    inputField(form, '实验室 / 机构（可选）', 'observation-laboratory', 'text');
    inputField(form, '检测方法（可选）', 'observation-method', 'text');
  }

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  actions.append(submitButton(indicator ? '保存指标' : '保存指标和检查结果'));
  form.append(actions);
  return form;
}

export function createObservationForm(indicator: Indicator, observation: Observation | null): HTMLFormElement {
  const form = document.createElement('form');
  form.id = 'observation-form';
  form.className = 'observation-editor';
  form.dataset.indicatorId = indicator.id;
  if (observation) form.dataset.itemId = observation.id;
  const title = document.createElement('h4');
  title.textContent = `${observation ? '编辑检查结果' : '添加检查结果'} / ${indicator.nameZh} · ${indicator.nameEn}`;
  form.append(title);
  inputField(form, '检查日期', 'observation-date', 'date', observation?.date ?? '', true);
  inputField(form, `检查数值（${indicator.unit}，可用 < > ≤ ≥）`, 'observation-value', 'text', observation ? observation.rawValue : '', true);
  inputField(form, '该次报告下限', 'observation-lower-limit', 'number', observation?.lowerLimit === null || observation?.lowerLimit === undefined ? '' : String(observation.lowerLimit));
  inputField(form, '该次报告上限', 'observation-upper-limit', 'number', observation?.upperLimit === null || observation?.upperLimit === undefined ? '' : String(observation.upperLimit));
  inputField(form, '实验室 / 机构（可选）', 'observation-laboratory', 'text', observation?.laboratory ?? '');
  inputField(form, '检测方法（可选）', 'observation-method', 'text', observation?.method ?? '');
  inputField(form, '样本说明（可选）', 'observation-specimen', 'text', observation?.specimen ?? '');
  const help = document.createElement('p');
  help.className = 'form-help';
  help.textContent = '参考范围必须来自该次报告；留空表示原报告未提供，不会从其他报告或网络补值。';
  form.append(help);
  const actions = document.createElement('div');
  actions.className = 'form-actions';
  actions.append(submitButton('保存检查结果'));
  form.append(actions);
  return form;
}

export type { ReportTextKind, ReportTextSection };
