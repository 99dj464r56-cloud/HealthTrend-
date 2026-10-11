import type { Indicator, Medication, Observation } from '../domain/types';

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

function textAreaField(form: HTMLFormElement, labelText: string, id: string, value = ''): HTMLTextAreaElement {
  const label = document.createElement('label');
  label.className = 'form-field form-field-wide';
  const caption = document.createElement('span');
  caption.textContent = labelText;
  const input = document.createElement('textarea');
  input.id = id;
  input.name = id;
  input.value = value;
  input.required = true;
  input.rows = 2;
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
  heading.textContent = medication ? '编辑药物 / Edit medication' : '添加药物 / Add medication';
  form.append(heading);
  inputField(form, '中文药名', 'medication-name-zh', 'text', medication?.nameZh ?? '', true);
  inputField(form, 'English medication name', 'medication-name-en', 'text', medication?.nameEn ?? '', true);
  inputField(form, '规格', 'medication-strength', 'text', medication?.strength ?? '', true);
  textAreaField(form, '用法', 'medication-instructions', medication?.instructions ?? '');
  inputField(form, '开始日期', 'medication-start-date', 'date', medication?.startDate ?? '');
  inputField(form, '结束日期', 'medication-end-date', 'date', medication?.endDate ?? '');

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
  actions.append(submitButton('保存药物'));
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
  inputField(form, '下限', 'indicator-lower-limit', 'number', indicator?.lowerLimit === null || indicator?.lowerLimit === undefined ? '' : String(indicator.lowerLimit));
  inputField(form, '上限', 'indicator-upper-limit', 'number', indicator?.upperLimit === null || indicator?.upperLimit === undefined ? '' : String(indicator.upperLimit));
  checkboxField(form, '重点关注 / Priority indicator', 'indicator-priority', indicator?.priority ?? false);

  if (!indicator) {
    const note = document.createElement('p');
    note.className = 'form-help';
    note.textContent = '下限或上限可留空；此处只使用原报告或医生确认的参考范围。可同时录入一条结果，之后继续添加历史结果。';
    form.append(note);
    inputField(form, '检查日期', 'observation-date', 'date');
    inputField(form, '检查数值', 'observation-value', 'number');
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
  inputField(form, `检查数值（${indicator.unit}）`, 'observation-value', 'number', observation ? String(observation.value) : '', true);
  const actions = document.createElement('div');
  actions.className = 'form-actions';
  actions.append(submitButton('保存检查结果'));
  form.append(actions);
  return form;
}
