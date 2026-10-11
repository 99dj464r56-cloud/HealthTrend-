import type { HealthRecord, Indicator, Medication, Observation } from '../domain/types';
import { createManualObservation, parseOptionalLimit } from '../import/manual';
import { exportBackup, parseBackup } from '../import/backup';
import { clearHealthRecord, loadHealthRecord, saveHealthRecord } from '../storage/indexedDb';
import { createPrivacyNotice } from './privacyNotice';
import { createIndicatorForm, createMedicationForm, createObservationForm } from './manualForms';
import { createReviewTable } from './reviewTable';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function makeButton(label: string, className = 'primary-button'): HTMLButtonElement {
  const button = element('button', className);
  button.type = 'button';
  button.textContent = label;
  return button;
}

function emptyRecord(): HealthRecord {
  return { schemaVersion: 1, medications: [], indicators: [], observations: [], sources: [] };
}

function makeHeader(): HTMLElement {
  const header = element('header', 'topbar');
  const brand = element('div', 'brand-lockup');
  const mark = element('span', 'brand-mark');
  mark.setAttribute('aria-hidden', 'true');
  const text = element('div');
  const title = element('h1');
  title.textContent = 'Health Trend PDF';
  const subtitle = element('p', 'brand-subtitle');
  subtitle.textContent = '个人健康记录 · Medication & lab trends';
  text.append(title, subtitle);
  brand.append(mark, text);
  const badge = element('span', 'device-badge');
  badge.textContent = '本机保存';
  header.append(brand, badge);
  return header;
}

function makeSectionHeading(titleText: string, subtitleText: string): HTMLElement {
  const header = element('div', 'workspace-heading');
  const title = element('h2');
  title.textContent = titleText;
  const subtitle = element('p', 'muted');
  subtitle.textContent = subtitleText;
  header.append(title, subtitle);
  return header;
}

function formDataText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalDate(data: FormData, name: string): string | null {
  return formDataText(data, name) || null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '无法保存资料，请检查填写内容。';
}

export async function mountApp(root: HTMLElement): Promise<void> {
  let record = await loadHealthRecord();
  let editingMedication: Medication | null = null;
  let editingIndicator: Indicator | null = null;
  let activeObservationIndicator: Indicator | null = null;
  let editingObservation: Observation | null = null;
  let pageError = '';

  async function commit(next: HealthRecord): Promise<void> {
    await saveHealthRecord(next);
    record = next;
    pageError = '';
    editingMedication = null;
    editingIndicator = null;
    activeObservationIndicator = null;
    editingObservation = null;
    render();
  }

  function renderLanding(): HTMLElement {
    const page = element('main', 'page-shell');
    page.append(makeHeader());
    const content = element('div', 'content-column');
    const intro = element('section', 'page-intro');
    const eyebrow = element('p', 'eyebrow');
    eyebrow.textContent = 'YOUR HEALTH, IN ONE CLEAR VIEW';
    const title = element('h2');
    title.textContent = '把检查结果，变成看得懂的变化';
    const description = element('p');
    description.textContent = '整理药物与历次检查指标，生成适合保存、比较和打印的双语趋势报告。';
    intro.append(eyebrow, title, description);
    content.append(intro, createPrivacyNotice());

    const card = element('section', 'record-card');
    card.setAttribute('aria-labelledby', 'record-state-title');
    const copy = element('div');
    const heading = element('h2');
    heading.id = 'record-state-title';
    heading.textContent = '还没有健康记录';
    const note = element('p', 'muted');
    note.textContent = '从药物资料或检查报告开始，手动输入或拍照导入都可以。';
    copy.append(heading, note);
    const startButton = makeButton('开始整理');
    startButton.dataset.action = 'start';
    startButton.addEventListener('click', async () => {
      await commit(emptyRecord());
    });
    card.append(copy, startButton);
    content.append(card);

    const footer = element('footer', 'page-footer');
    footer.textContent = '仅用于整理个人记录；检查参考范围请以原报告为准，医疗决定请咨询专业人员。';
    content.append(footer);
    page.append(content);
    return page;
  }

  function renderWorkspace(): HTMLElement {
    const page = element('main', 'page-shell');
    page.append(makeHeader());
    const content = element('div', 'workspace-column');
    content.append(makeSectionHeading('健康记录工作区', '请先核对每项药物和检查信息，再用于趋势报告。'));
    content.append(createPrivacyNotice());

    if (pageError) {
      const error = element('p', 'form-error');
      error.setAttribute('role', 'alert');
      error.textContent = pageError;
      content.append(error);
    }

    const dataToolbar = element('section', 'data-toolbar');
    const toolbarHeading = element('div');
    const toolbarTitle = element('h3');
    toolbarTitle.textContent = '资料管理 / Data';
    const toolbarNote = element('p', 'muted');
    toolbarNote.textContent = '备份文件只包含已确认的文字记录，不包含原始照片或 PDF。';
    toolbarHeading.append(toolbarTitle, toolbarNote);
    const toolbarActions = element('div', 'toolbar-actions');
    const exportButton = makeButton('导出 JSON 备份', 'secondary-button');
    exportButton.addEventListener('click', () => {
      if (!record) return;
      const url = URL.createObjectURL(exportBackup(record));
      const link = element('a');
      link.href = url;
      link.download = `health-record-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const importLabel = element('label', 'secondary-button file-button');
    importLabel.textContent = '导入 JSON 备份';
    const importInput = element('input');
    importInput.id = 'backup-import';
    importInput.type = 'file';
    importInput.accept = 'application/json,.json';
    importInput.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        if (record && (record.medications.length || record.indicators.length || record.observations.length)) {
          if (!window.confirm('导入将替换当前本机记录，是否继续？')) return;
        }
        await commit(await parseBackup(file));
      } catch (error) {
        pageError = getErrorMessage(error);
        render();
      } finally {
        importInput.value = '';
      }
    });
    importLabel.append(importInput);
    const clearButton = makeButton('删除全部本机资料', 'danger-button');
    clearButton.addEventListener('click', async () => {
      if (!window.confirm('确定删除此浏览器中保存的全部健康资料？此操作无法撤销。')) return;
      await clearHealthRecord();
      record = null;
      render();
    });
    toolbarActions.append(exportButton, importLabel, clearButton);
    dataToolbar.append(toolbarHeading, toolbarActions);
    content.append(dataToolbar);

    const forms = element('div', 'forms-grid');
    const medPanel = element('section', 'form-panel');
    medPanel.append(createMedicationForm(editingMedication, record?.indicators ?? []));
    const indicatorPanel = element('section', 'form-panel');
    indicatorPanel.append(createIndicatorForm(editingIndicator));
    forms.append(medPanel, indicatorPanel);
    content.append(forms);

    const observationEditorHost = element('div', 'observation-editor-host');
    if (activeObservationIndicator) {
      observationEditorHost.append(createObservationForm(activeObservationIndicator, editingObservation));
    }
    content.append(observationEditorHost);

    const savedRecords = element('section', 'saved-records');
    savedRecords.append(makeSectionHeading('已确认的资料', '这些内容已保存在本机；OCR 草稿只有经你确认后才会进入此处。'));
    savedRecords.append(createReviewTable(record ?? emptyRecord()));
    content.append(savedRecords);

    const footer = element('footer', 'page-footer');
    footer.textContent = '不同实验室或个体的参考范围可能不同；空白范围不会被自动补入通用标准。';
    content.append(footer);
    page.append(content);

    const medicationForm = page.querySelector<HTMLFormElement>('#medication-form');
    medicationForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      void (async () => {
        try {
          const data = new FormData(medicationForm);
          const id = medicationForm.dataset.itemId ?? crypto.randomUUID();
          const medication: Medication = {
            id,
            nameZh: formDataText(data, 'medication-name-zh'),
            nameEn: formDataText(data, 'medication-name-en'),
            strength: formDataText(data, 'medication-strength'),
            instructions: formDataText(data, 'medication-instructions'),
            startDate: readOptionalDate(data, 'medication-start-date'),
            endDate: readOptionalDate(data, 'medication-end-date'),
            linkedIndicatorIds: data.getAll('linkedIndicatorIds').filter((value): value is string => typeof value === 'string'),
          };
          const medications = [...(record?.medications ?? [])];
          const index = medications.findIndex((item) => item.id === id);
          if (index >= 0) medications[index] = medication;
          else medications.push(medication);
          await commit({ ...(record ?? emptyRecord()), medications });
        } catch (error) {
          pageError = getErrorMessage(error);
          render();
        }
      })();
    });

    const indicatorForm = page.querySelector<HTMLFormElement>('#indicator-form');
    indicatorForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      void (async () => {
        try {
          const data = new FormData(indicatorForm);
          const id = indicatorForm.dataset.itemId ?? crypto.randomUUID();
          const indicator: Indicator = {
            id,
            nameZh: formDataText(data, 'indicator-name-zh'),
            nameEn: formDataText(data, 'indicator-name-en'),
            purposeZh: formDataText(data, 'indicator-purpose-zh'),
            purposeEn: formDataText(data, 'indicator-purpose-en'),
            category: formDataText(data, 'indicator-category'),
            unit: formDataText(data, 'indicator-unit'),
            lowerLimit: parseOptionalLimit(formDataText(data, 'indicator-lower-limit')),
            upperLimit: parseOptionalLimit(formDataText(data, 'indicator-upper-limit')),
            priority: data.get('indicator-priority') === 'on',
          };
          const current = record?.indicators.find((item) => item.id === id);
          if (current && current.unit !== indicator.unit && record?.observations.some((item) => item.indicatorId === id)) {
            throw new Error('此指标已有历史数据，不能直接更换单位；请新增一个独立指标。');
          }
          const indicators = [...(record?.indicators ?? [])];
          const index = indicators.findIndex((item) => item.id === id);
          if (index >= 0) indicators[index] = indicator;
          else indicators.push(indicator);

          const date = formDataText(data, 'observation-date');
          const rawValue = formDataText(data, 'observation-value');
          const observations = [...(record?.observations ?? [])];
          if (date || rawValue) {
            if (!date || !rawValue) throw new Error('请同时填写检查日期和检查数值，或两项都留空。');
            observations.push(createManualObservation(indicator, { id: crypto.randomUUID(), date, value: rawValue }));
          }
          await commit({ ...(record ?? emptyRecord()), indicators, observations });
        } catch (error) {
          pageError = getErrorMessage(error);
          render();
        }
      })();
    });

    const observationForm = page.querySelector<HTMLFormElement>('#observation-form');
    observationForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      void (async () => {
        try {
          const data = new FormData(observationForm);
          const indicator = record?.indicators.find((item) => item.id === observationForm.dataset.indicatorId);
          if (!indicator) throw new Error('该指标已不存在，请重新选择。');
          const id = observationForm.dataset.itemId ?? crypto.randomUUID();
          const observation = createManualObservation(indicator, {
            id,
            date: formDataText(data, 'observation-date'),
            value: formDataText(data, 'observation-value'),
          });
          const observations = [...(record?.observations ?? [])];
          const index = observations.findIndex((item) => item.id === id);
          if (index >= 0) observations[index] = observation;
          else observations.push(observation);
          await commit({ ...(record ?? emptyRecord()), observations });
        } catch (error) {
          pageError = getErrorMessage(error);
          render();
        }
      })();
    });

    page.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const actionButton = target.closest<HTMLButtonElement>('[data-action]');
      if (!actionButton || !record) return;
      const action = actionButton.dataset.action;
      const id = actionButton.dataset.id;
      if (!id) return;

      if (action === 'edit-medication') {
        editingMedication = record.medications.find((item) => item.id === id) ?? null;
        render();
        root.querySelector('#medication-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (action === 'delete-medication') {
        const medication = record.medications.find((item) => item.id === id);
        if (!medication || !window.confirm(`删除药物“${medication.nameZh}”？`)) return;
        void commit({ ...record, medications: record.medications.filter((item) => item.id !== id) });
      } else if (action === 'edit-indicator') {
        editingIndicator = record.indicators.find((item) => item.id === id) ?? null;
        render();
        root.querySelector('#indicator-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (action === 'delete-indicator') {
        const indicator = record.indicators.find((item) => item.id === id);
        if (!indicator || !window.confirm(`删除指标“${indicator.nameZh}”及其关联结果？`)) return;
        void commit({
          ...record,
          indicators: record.indicators.filter((item) => item.id !== id),
          observations: record.observations.filter((item) => item.indicatorId !== id),
          medications: record.medications.map((item) => ({ ...item, linkedIndicatorIds: item.linkedIndicatorIds.filter((linkedId) => linkedId !== id) })),
        });
      } else if (action === 'add-observation' || action === 'edit-observation') {
        const observation = action === 'edit-observation' ? record.observations.find((item) => item.id === id) ?? null : null;
        const indicator = record.indicators.find((item) => item.id === (observation?.indicatorId ?? id));
        if (!indicator) return;
        activeObservationIndicator = indicator;
        editingObservation = observation;
        render();
        root.querySelector('#observation-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (action === 'delete-observation') {
        const observation = record.observations.find((item) => item.id === id);
        if (!observation || !window.confirm(`删除 ${observation.date} 的检查结果？`)) return;
        void commit({ ...record, observations: record.observations.filter((item) => item.id !== id) });
      }
    });

    return page;
  }

  function render(): void {
    root.replaceChildren(record ? renderWorkspace() : renderLanding());
  }

  render();
}
