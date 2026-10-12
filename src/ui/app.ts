import type { HealthRecord, Indicator, Medication, MedicationRegimenStage, Observation, Profile, ReportTextBlock, ReportTextKind, ReportTextSection } from '../domain/types';
import { emptyHealthRecord } from '../domain/types';
import { profileNameMismatch } from '../domain/migrate';
import { assertRegimenStageDates } from '../domain/validation';
import { classifyObservationImport, findDuplicateReportText, formatImportCoverage, reportTextFingerprint, summarizeImportCoverage } from '../import/importCoverage';
import { createManualObservation, parseOptionalLimit } from '../import/manual';
import {
  applyBackupImportStrategy,
  exportBackup,
  formatBackupPreviewSummary,
  previewBackup,
} from '../import/backup';
import { clearHealthRecord, loadHealthRecord, saveHealthRecord } from '../storage/indexedDb';
import { createPrivacyNotice } from './privacyNotice';
import { createIndicatorForm, createMedicationForm, createObservationForm, createRegimenStageForm, createReportTextForm } from './manualForms';
import { createReviewTable } from './reviewTable';
import { createImportPanel } from './importPanel';
import { createAppleHealthImportPanel } from './appleHealthImport';
import { buildReportModel } from '../report/reportModel';
import { createPrintView } from '../report/printView';

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
  return emptyHealthRecord();
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


function createProfilePanel(profile: Profile): HTMLElement {
  const section = element('section', 'profile-panel form-panel');
  const heading = element('h3');
  heading.textContent = '档案身份 / Profile';
  const note = element('p', 'form-help');
  note.textContent = '请填写本机档案显示名并确认身份，降低本人与家人资料混淆。OCR 检出的姓名只作提示，不会自动归档。';
  const form = element('form');
  form.id = 'profile-form';
  form.className = 'edit-form';
  const nameLabel = element('label', 'form-field');
  const nameCaption = element('span');
  nameCaption.textContent = '档案显示名';
  const nameInput = element('input');
  nameInput.id = 'profile-display-name';
  nameInput.name = 'profile-display-name';
  nameInput.type = 'text';
  nameInput.value = profile.displayName;
  nameInput.required = true;
  nameInput.placeholder = '例如：Alex Demo（请用化名／代号）';
  nameLabel.append(nameCaption, nameInput);
  const confirmLabel = element('label', 'checkbox-field');
  const confirmInput = element('input');
  confirmInput.id = 'profile-identity-confirmed';
  confirmInput.name = 'profile-identity-confirmed';
  confirmInput.type = 'checkbox';
  confirmInput.checked = profile.identityConfirmed;
  const confirmText = element('span');
  confirmText.textContent = '我确认以上显示名对应该档案所属人';
  confirmLabel.append(confirmInput, confirmText);
  const actions = element('div', 'form-actions');
  const save = makeButton('保存档案身份');
  save.type = 'submit';
  actions.append(save);
  form.append(nameLabel, confirmLabel, actions);
  section.append(heading, note, form);
  return section;
}

export async function mountApp(root: HTMLElement): Promise<void> {
  let record = await loadHealthRecord();
  let editingMedication: Medication | null = null;
  let editingIndicator: Indicator | null = null;
  let activeObservationIndicator: Indicator | null = null;
  let editingObservation: Observation | null = null;
  let editingRegimenStage: MedicationRegimenStage | null = null;
  let regimenStageMedicationId: string | null = null;
  let editingReportText: ReportTextBlock | null = null;
  let importCoverageNote = '';
  let pageError = '';

  async function commit(next: HealthRecord): Promise<void> {
    await saveHealthRecord(next);
    record = next;
    pageError = '';
    editingMedication = null;
    editingIndicator = null;
    activeObservationIndicator = null;
    editingObservation = null;
    editingRegimenStage = null;
    regimenStageMedicationId = null;
    editingReportText = null;
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
    content.append(createProfilePanel(record?.profile ?? emptyRecord().profile));

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
    const reportButton = makeButton('预览趋势报告 / PDF', 'secondary-button');
    reportButton.addEventListener('click', () => {
      if (!record) return;
      root.replaceChildren(createPrintView(buildReportModel(record), {
        onPrint: () => window.print(),
        onBack: render,
      }));
    });
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
        const { preview, record: incoming } = await previewBackup(file);
        const summary = formatBackupPreviewSummary(preview);
        const hasLocal = Boolean(record && (
          record.medications.length || record.indicators.length || record.observations.length
          || record.reportTextBlocks.length || record.appleHealthRecords.length
        ));
        const prompt = hasLocal
          ? `${summary}

导入策略：替换本机全部记录（replace-all）。确定继续？取消则不写入。`
          : `${summary}

确定导入该备份到本机？取消则不写入。`;
        if (!window.confirm(prompt)) {
          applyBackupImportStrategy(record, incoming, 'cancel');
          return;
        }
        const next = applyBackupImportStrategy(record, incoming, 'replace-all');
        if (!next) return;
        await commit(next);
      } catch (error) {
        // Failed preview/parse never reaches commit — IndexedDB stays unchanged.
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
    toolbarActions.append(reportButton, exportButton, importLabel, clearButton);
    dataToolbar.append(toolbarHeading, toolbarActions);
    content.append(dataToolbar);

    content.append(createImportPanel(async ({ candidate, file, pageCount, sourceId }) => {
      const current = record ?? emptyRecord();
      let indicator = current.indicators.find((item) => item.nameZh === candidate.nameZh && item.nameEn === candidate.nameEn && item.unit === candidate.unit);
      const indicators = [...current.indicators];
      if (!current.profile.identityConfirmed || !current.profile.displayName.trim()) {
        throw new Error('请先在「档案身份」中填写并确认显示名，再导入检查结果。');
      }
      const ocrPersonHint = (candidate as { personNameHint?: string }).personNameHint;
      if (profileNameMismatch(ocrPersonHint, current.profile)) {
        if (!window.confirm(`识别文字中的姓名提示“${ocrPersonHint}”与当前档案“${current.profile.displayName}”不一致。仅在确认属于同一人时继续；不会自动改归档。`)) {
          return;
        }
      }
      const lowerFromCandidate = candidate.lowerLimit ? Number(candidate.lowerLimit) : null;
      const upperFromCandidate = candidate.upperLimit ? Number(candidate.upperLimit) : null;
      const reviewedIndicator: Indicator = {
        id: indicator?.id ?? crypto.randomUUID(), nameZh: candidate.nameZh, nameEn: candidate.nameEn,
        purposeZh: candidate.purposeZh || indicator?.purposeZh || '',
        purposeEn: candidate.purposeEn || indicator?.purposeEn || '',
        category: candidate.category || indicator?.category || '',
        unit: candidate.unit,
        // Indicator limits are defaults for *new* manual rows only — never overwrite from a later report
        // when the indicator already exists (avoids historical reclassification via catalog mutation).
        lowerLimit: indicator ? indicator.lowerLimit : (Number.isFinite(lowerFromCandidate) ? lowerFromCandidate : null),
        upperLimit: indicator ? indicator.upperLimit : (Number.isFinite(upperFromCandidate) ? upperFromCandidate : null),
        priority: candidate.priority || indicator?.priority || false,
      };
      if (!indicator) {
        indicator = reviewedIndicator;
        indicators.push(indicator);
      } else {
        indicator = {
          ...reviewedIndicator,
          lowerLimit: indicator.lowerLimit,
          upperLimit: indicator.upperLimit,
        };
        const index = indicators.findIndex((item) => item.id === indicator?.id);
        if (index >= 0) indicators[index] = indicator;
      }
      const sources = current.sources.some((source) => source.id === sourceId) ? current.sources : [...current.sources, {
        id: sourceId, fileName: file.name, type: file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 'pdf' as const : 'image' as const,
        importedAt: new Date().toISOString(), pageCount,
      }];
      const observation = createManualObservation(indicator, {
        id: crypto.randomUUID(),
        date: candidate.date,
        value: candidate.value,
        pageNumber: candidate.pageNumber,
        lowerLimit: candidate.lowerLimit,
        upperLimit: candidate.upperLimit,
        rangeProvenance: (candidate.lowerLimit || candidate.upperLimit) ? 'from-report' : 'unknown',
      }, sourceId);
      const conflict = classifyObservationImport(observation, current.observations);
      if (conflict === 'duplicate') {
        importCoverageNote = formatImportCoverage(summarizeImportCoverage({
          candidates: 1, confirmed: 0, unrecognizedLines: 0,
          skipped: [{ reason: '完全重复，未写入', count: 1 }],
        }));
        pageError = '检测到完全重复的检查结果，未重复写入。';
        render();
        return;
      }
      if (conflict === 'conflict') {
        if (!window.confirm('存在相似但数值/来源/方法不同的检查结果，确认为冲突并仍然新增吗？')) {
          importCoverageNote = formatImportCoverage(summarizeImportCoverage({
            candidates: 1, confirmed: 0, skipped: [{ reason: '用户取消冲突写入', count: 1 }],
          }));
          return;
        }
      }
      const observations = [...current.observations, observation];
      const next = { ...current, indicators, observations, sources };
      await saveHealthRecord(next);
      record = next;
      importCoverageNote = formatImportCoverage(summarizeImportCoverage({
        candidates: 1, confirmed: 1, unrecognizedLines: 0,
      }));
      const savedRecords = root.querySelector('.saved-records');
      if (savedRecords) {
        savedRecords.replaceChildren(
          makeSectionHeading('已确认的资料', '这些内容已保存在本机；OCR 草稿只有经你确认后才会进入此处。'),
          createReviewTable(record),
        );
      }
    }));

    content.append(createAppleHealthImportPanel(() => record, async ({ records, source }) => {
      const current = record ?? emptyRecord();
      if (!current.profile.identityConfirmed) throw new Error('请先确认档案身份。');
      const sources = current.sources.some((item) => item.id === source.id)
        ? current.sources
        : [...current.sources, source];
      // Idempotent: skip fingerprints already present
      const existing = new Set(current.appleHealthRecords.map((row) => row.importFingerprint));
      const appleHealthRecords = [
        ...current.appleHealthRecords,
        ...records.filter((row) => !existing.has(row.importFingerprint)),
      ];
      await commit({ ...current, sources, appleHealthRecords });
    }));

    if (importCoverageNote) {
      const coverage = element('p', 'form-help');
      coverage.dataset.importCoverage = 'true';
      coverage.textContent = importCoverageNote;
      content.append(coverage);
    }

    const forms = element('div', 'forms-grid');
    const medPanel = element('section', 'form-panel');
    medPanel.append(createMedicationForm(editingMedication, record?.indicators ?? []));
    if ((record?.medications.length ?? 0) > 0) {
      medPanel.append(createRegimenStageForm(record!.medications, editingRegimenStage, regimenStageMedicationId));
    }
    const indicatorPanel = element('section', 'form-panel');
    indicatorPanel.append(createIndicatorForm(editingIndicator));
    indicatorPanel.append(createReportTextForm(editingReportText));
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


    const profileForm = page.querySelector<HTMLFormElement>('#profile-form');
    profileForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      void (async () => {
        try {
          const data = new FormData(profileForm);
          const displayName = formDataText(data, 'profile-display-name');
          const identityConfirmed = data.get('profile-identity-confirmed') === 'on';
          if (identityConfirmed && !displayName) throw new Error('确认身份前请先填写档案显示名。');
          const profile: Profile = { displayName, identityConfirmed };
          await commit({ ...(record ?? emptyRecord()), profile });
        } catch (error) {
          pageError = getErrorMessage(error);
          render();
        }
      })();
    });

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


    const regimenForm = page.querySelector<HTMLFormElement>('#regimen-stage-form');
    regimenForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      void (async () => {
        try {
          const data = new FormData(regimenForm);
          const id = regimenForm.dataset.itemId ?? crypto.randomUUID();
          const startDate = readOptionalDate(data, 'stage-start-date');
          const endDate = readOptionalDate(data, 'stage-end-date');
          assertRegimenStageDates(startDate, endDate);
          const stage: MedicationRegimenStage = {
            id,
            medicationId: formDataText(data, 'stage-medication-id'),
            strengthLabel: formDataText(data, 'stage-strength-label'),
            doseAmount: formDataText(data, 'stage-dose-amount') || null,
            doseUnit: formDataText(data, 'stage-dose-unit') || null,
            frequency: formDataText(data, 'stage-frequency'),
            form: formDataText(data, 'stage-form') || null,
            packCountLabel: formDataText(data, 'stage-pack-count') || null,
            startDate,
            endDate,
          };
          if (!stage.medicationId) throw new Error('请选择所属药物。');
          const regimenStages = [...(record?.regimenStages ?? [])];
          const index = regimenStages.findIndex((item) => item.id === id);
          // Editing updates that stage only — other historical stages remain.
          if (index >= 0) regimenStages[index] = stage;
          else regimenStages.push(stage);
          await commit({ ...(record ?? emptyRecord()), regimenStages });
        } catch (error) {
          pageError = getErrorMessage(error);
          render();
        }
      })();
    });

    const reportTextForm = page.querySelector<HTMLFormElement>('#report-text-form');
    reportTextForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      void (async () => {
        try {
          const data = new FormData(reportTextForm);
          if (data.get('report-text-confirmed') !== 'on') {
            throw new Error('请先勾选确认：未核对文字不会写入记录或 PDF。');
          }
          const id = reportTextForm.dataset.itemId ?? crypto.randomUUID();
          const pageRaw = formDataText(data, 'report-text-page');
          const pageNumber = pageRaw ? Number(pageRaw) : null;
          const sectionKind = formDataText(data, 'report-text-section-kind') as ReportTextSection;
          const kind = formDataText(data, 'report-text-kind') as ReportTextKind;
          const draft = {
            reportName: formDataText(data, 'report-text-name'),
            reportDate: readOptionalDate(data, 'report-text-date'),
            laboratory: formDataText(data, 'report-text-lab') || null,
            pageNumber: Number.isFinite(pageNumber) && pageNumber && pageNumber > 0 ? pageNumber : null,
            sectionTitle: formDataText(data, 'report-text-section-title'),
            body: formDataText(data, 'report-text-body'),
          };
          const fingerprint = reportTextFingerprint(draft);
          const currentBlocks = record?.reportTextBlocks ?? [];
          const duplicate = findDuplicateReportText(draft, currentBlocks.filter((block) => block.id !== id));
          if (duplicate) {
            throw new Error('检测到相同报告段落（名称/日期/机构/页码/标题/正文一致），未重复写入。');
          }
          const block: ReportTextBlock = {
            id,
            sourceId: editingReportText?.sourceId ?? null,
            ...draft,
            sectionKind,
            kind,
            contentFingerprint: fingerprint,
            confirmed: true,
          };
          const reportTextBlocks = [...currentBlocks];
          const index = reportTextBlocks.findIndex((item) => item.id === id);
          if (index >= 0) reportTextBlocks[index] = block;
          else reportTextBlocks.push(block);
          await commit({ ...(record ?? emptyRecord()), reportTextBlocks });
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
            observations.push(createManualObservation(indicator, {
              id: crypto.randomUUID(),
              date,
              value: rawValue,
              lowerLimit: formDataText(data, 'indicator-lower-limit'),
              upperLimit: formDataText(data, 'indicator-upper-limit'),
              laboratory: formDataText(data, 'observation-laboratory') || null,
              method: formDataText(data, 'observation-method') || null,
              rangeProvenance: (formDataText(data, 'indicator-lower-limit') || formDataText(data, 'indicator-upper-limit')) ? 'from-report' : 'unknown',
            }));
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
            pageNumber: editingObservation?.pageNumber,
            lowerLimit: formDataText(data, 'observation-lower-limit'),
            upperLimit: formDataText(data, 'observation-upper-limit'),
            laboratory: formDataText(data, 'observation-laboratory') || null,
            method: formDataText(data, 'observation-method') || null,
            specimen: formDataText(data, 'observation-specimen') || null,
            previous: editingObservation,
          }, editingObservation?.sourceId ?? null);
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
        void commit({
          ...record,
          medications: record.medications.filter((item) => item.id !== id),
          regimenStages: record.regimenStages.filter((stage) => stage.medicationId !== id),
        });
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
      } else if (action === 'add-regimen-stage') {
        regimenStageMedicationId = id;
        editingRegimenStage = null;
        render();
        root.querySelector('#regimen-stage-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (action === 'edit-regimen-stage') {
        editingRegimenStage = record.regimenStages.find((item) => item.id === id) ?? null;
        regimenStageMedicationId = editingRegimenStage?.medicationId ?? null;
        render();
        root.querySelector('#regimen-stage-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (action === 'delete-regimen-stage') {
        const stage = record.regimenStages.find((item) => item.id === id);
        if (!stage || !window.confirm('删除该用药阶段？其他历史阶段将保留。')) return;
        void commit({ ...record, regimenStages: record.regimenStages.filter((item) => item.id !== id) });
      } else if (action === 'edit-report-text') {
        editingReportText = record.reportTextBlocks.find((item) => item.id === id) ?? null;
        render();
        root.querySelector('#report-text-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (action === 'delete-report-text') {
        const block = record.reportTextBlocks.find((item) => item.id === id);
        if (!block || !window.confirm('删除这段已确认的报告文字？')) return;
        void commit({ ...record, reportTextBlocks: record.reportTextBlocks.filter((item) => item.id !== id) });
      }
    });

    return page;
  }

  function render(): void {
    root.replaceChildren(record ? renderWorkspace() : renderLanding());
  }

  render();
}
