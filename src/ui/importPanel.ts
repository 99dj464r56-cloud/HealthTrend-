import { extractPdfText } from '../import/pdfText';
import { recognizeImage, type OcrProgress } from '../import/imageOcr';
import { parseCandidates, type ImportCandidate, type SourcePage } from '../import/parseCandidates';
import { parseMedicationCandidates, type MedicationImportCandidate } from '../import/medicationPackaging';
import { validateImportFile } from '../import/limits';

export interface ConfirmedDraft {
  candidate: ImportCandidate;
  file: File;
  pageCount: number;
  sourceId: string;
}

export interface ConfirmedMedicationDraft {
  candidate: MedicationImportCandidate;
  file: File;
  pageCount: number;
  sourceId: string;
}

export interface ImportPanelHandlers {
  onConfirmObservation: (draft: ConfirmedDraft) => Promise<void>;
  onConfirmMedication: (draft: ConfirmedMedicationDraft) => Promise<void>;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  if (className) value.className = className;
  return value;
}

function field(form: HTMLElement, caption: string, name: string, value: string, type = 'text', required = false): HTMLInputElement {
  const label = node('label', 'form-field');
  const text = node('span');
  text.textContent = caption;
  const input = node('input');
  input.name = name;
  input.type = type;
  input.value = value;
  input.required = required;
  if (type === 'number') input.step = 'any';
  label.append(text, input);
  form.append(label);
  return input;
}

function readForm(form: HTMLFormElement, name: string): string {
  return String(formData(form).get(name) ?? '').trim();
}

function formData(form: HTMLFormElement): FormData {
  return new FormData(form);
}

function selectCandidate(candidate: ImportCandidate, form: HTMLFormElement): ImportCandidate {
  const data = formData(form);
  const read = (name: keyof ImportCandidate) => String(data.get(name) ?? '').trim();
  return {
    ...candidate,
    nameZh: read('nameZh'), nameEn: read('nameEn'), purposeZh: read('purposeZh'), purposeEn: read('purposeEn'),
    category: read('category'), date: read('date'), value: read('value'), unit: read('unit'),
    lowerLimit: read('lowerLimit'), upperLimit: read('upperLimit'),
  };
}

function selectMedication(candidate: MedicationImportCandidate, form: HTMLFormElement): MedicationImportCandidate {
  return {
    ...candidate,
    nameZh: readForm(form, 'nameZh'),
    nameEn: readForm(form, 'nameEn'),
    strengthLabel: readForm(form, 'strengthLabel'),
    doseAmount: readForm(form, 'doseAmount'),
    doseUnit: readForm(form, 'doseUnit'),
    frequency: readForm(form, 'frequency'),
    form: readForm(form, 'form'),
    packCountLabel: readForm(form, 'packCountLabel'),
    linkedIndicatorHints: readForm(form, 'linkedIndicatorHints'),
  };
}

/**
 * Photo/PDF import: lab observation drafts + medication packaging drafts.
 * Nothing is written until the user confirms a draft card.
 */
export function createImportPanel(handlers: ImportPanelHandlers): HTMLElement {
  const panel = node('section', 'import-panel');
  const heading = node('h3');
  heading.textContent = '照片 / PDF 导入（化验 + 药盒）';
  const note = node('p', 'muted');
  note.textContent = '选择药盒或化验照片／PDF → 本机识别 → 核对草稿后写入。';
  const label = node('label', 'secondary-button file-button');
  label.textContent = '选择照片或 PDF';
  const input = node('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp,application/pdf,.pdf';
  input.setAttribute('capture', 'environment');
  input.multiple = true;
  input.setAttribute('aria-label', '选择照片或 PDF 文件');
  label.append(input);
  const progress = node('p', 'import-progress');
  progress.setAttribute('role', 'status');
  const cancel = node('button', 'text-button');
  cancel.type = 'button';
  cancel.textContent = '取消当前导入';
  cancel.hidden = true;
  const review = node('div', 'import-review-list');
  panel.append(heading, note, label, progress, cancel, review);
  let activeController: AbortController | null = null;
  cancel.addEventListener('click', () => activeController?.abort());

  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    void (async () => {
      review.replaceChildren();
      for (const file of files) {
        const controller = new AbortController();
        activeController = controller;
        cancel.hidden = false;
        try {
          validateImportFile(file);
          const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
          progress.textContent = `准备本机识别：${file.name}`;
          let pages: SourcePage[];
          if (isPdf) {
            pages = await extractPdfText(file, (fraction) => {
              progress.textContent = `读取 PDF：${file.name} · ${Math.round(fraction * 100)}%`;
            }, controller.signal, formatProgress);
          } else {
            const page = await recognizeImage(file, formatProgress, controller.signal);
            pages = [page];
          }
          const sourceId = crypto.randomUUID();
          const labCandidates = pages.flatMap(parseCandidates);
          const medCandidates = pages.flatMap(parseMedicationCandidates);
          for (const candidate of medCandidates) addMedicationDraft(candidate, file, pages.length, sourceId);
          for (const candidate of labCandidates) addObservationDraft(candidate, file, pages.length, sourceId);
          for (const page of pages) {
            if (!page.text.trim()) continue;
            const details = node('details', 'recognized-text');
            const summary = node('summary');
            summary.textContent = `第 ${page.pageNumber} 页识别文本（临时预览，不会保存）`;
            const text = node('pre');
            text.textContent = page.text;
            details.append(summary, text);
            review.append(details);
          }
          if (!labCandidates.length && !medCandidates.length) {
            const message = node('p', 'import-empty');
            message.textContent = `${file.name} 已识别，但没有找到可安全提取的化验行或药盒字段。请使用底部手动录入；原始识别文本不会保存。`;
            review.append(message);
          }
          progress.textContent = `${file.name}：完成 ${pages.length} 页本机识别 · 药物草稿 ${medCandidates.length} · 化验草稿 ${labCandidates.length}（均需核对）。`;
        } catch (error) {
          progress.textContent = error instanceof Error ? error.message : '本机识别失败，请尝试手动录入。';
        } finally {
          if (activeController === controller) activeController = null;
          cancel.hidden = activeController === null;
        }
      }
    })();
  });

  function formatProgress(value: OcrProgress): void {
    const pct = Number.isFinite(value.progress) ? Math.round(value.progress * 100) : 0;
    progress.textContent = `${value.message || '本机 OCR'}${pct ? ` · ${pct}%` : ''}`;
  }

  function addObservationDraft(candidate: ImportCandidate, file: File, pageCount: number, sourceId: string): void {
    const card = node('article', 'import-candidate');
    const title = node('h4');
    title.textContent = `化验草稿 · 第 ${candidate.pageNumber} 页`;
    const source = node('p', 'candidate-source');
    source.textContent = candidate.sourceText;
    const quality = node('p', 'candidate-quality');
    quality.textContent = candidate.confidence === null ? '来源：PDF 文字层' : `OCR 识别置信度：${Math.round(candidate.confidence)}%（仅供参考）`;
    const form = node('form', 'candidate-form');
    field(form, '中文指标名称', 'nameZh', candidate.nameZh, 'text', true);
    field(form, 'English indicator name', 'nameEn', candidate.nameEn, 'text', true);
    field(form, '检查日期', 'date', candidate.date, 'date', true);
    field(form, '数值', 'value', candidate.value, 'number', true);
    field(form, '单位', 'unit', candidate.unit, 'text', true);
    field(form, '下限（报告未写则留空）', 'lowerLimit', candidate.lowerLimit, 'number');
    field(form, '上限（报告未写则留空）', 'upperLimit', candidate.upperLimit, 'number');
    field(form, '分类', 'category', candidate.category, 'text', true);
    field(form, '中文用途', 'purposeZh', candidate.purposeZh, 'text', true);
    field(form, 'English purpose', 'purposeEn', candidate.purposeEn, 'text', true);
    const actions = node('div', 'candidate-actions');
    const confirm = node('button', 'primary-button');
    confirm.type = 'submit';
    confirm.textContent = '核对并加入化验记录';
    const discard = node('button', 'text-button');
    discard.type = 'button';
    discard.textContent = '舍弃草稿';
    discard.addEventListener('click', () => card.remove());
    actions.append(confirm, discard);
    form.append(actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void (async () => {
        const completed = selectCandidate(candidate, form);
        if (!completed.date || !Number.isFinite(Number(completed.value)) || !completed.nameZh || !completed.nameEn
          || !completed.purposeZh || !completed.purposeEn || !completed.category || !completed.unit) {
          progress.textContent = '请核对并填写日期、数值、单位、双语名称和用途及分类。参考范围可以留空。';
          return;
        }
        try {
          await handlers.onConfirmObservation({ candidate: completed, file, pageCount, sourceId });
          card.remove();
          progress.textContent = '已将这条经确认的化验记录保存在本机。';
        } catch (error) {
          progress.textContent = error instanceof Error ? error.message : '保存失败，请检查草稿。';
        }
      })();
    });
    card.append(title, source, quality, form);
    review.append(card);
  }

  function addMedicationDraft(candidate: MedicationImportCandidate, file: File, pageCount: number, sourceId: string): void {
    const card = node('article', 'import-candidate import-candidate-med');
    const title = node('h4');
    title.textContent = `药物草稿 · 第 ${candidate.pageNumber} 页`;
    const source = node('p', 'candidate-source');
    source.textContent = candidate.sourceText;
    const quality = node('p', 'candidate-quality');
    quality.textContent = candidate.confidence === null
      ? '来源：PDF 文字层 · 药盒／标签启发式解析'
      : `OCR 置信度：${Math.round(candidate.confidence)}% · 药盒／标签启发式解析（须人工核对）`;
    if (candidate.warnings.length) {
      const warn = node('p', 'form-help');
      warn.textContent = candidate.warnings.join(' ');
      card.append(title, source, quality, warn);
    } else {
      card.append(title, source, quality);
    }
    const form = node('form', 'candidate-form');
    field(form, '中文药名', 'nameZh', candidate.nameZh, 'text', true);
    field(form, 'English medication name', 'nameEn', candidate.nameEn, 'text', true);
    field(form, '规格（如 10 mg）', 'strengthLabel', candidate.strengthLabel, 'text', true);
    field(form, '单次剂量数量', 'doseAmount', candidate.doseAmount, 'text');
    field(form, '单次剂量单位', 'doseUnit', candidate.doseUnit, 'text');
    field(form, '服用频率', 'frequency', candidate.frequency, 'text', true);
    field(form, '剂型', 'form', candidate.form, 'text');
    field(form, '包装数量（不是剂量）', 'packCountLabel', candidate.packCountLabel, 'text');
    field(form, '建议关联指标名称（分号分隔；仅提示，不写入化验值）', 'linkedIndicatorHints', candidate.linkedIndicatorHints, 'text');
    const actions = node('div', 'candidate-actions');
    const confirm = node('button', 'primary-button');
    confirm.type = 'submit';
    confirm.textContent = '核对并加入药单';
    const discard = node('button', 'text-button');
    discard.type = 'button';
    discard.textContent = '舍弃草稿';
    discard.addEventListener('click', () => card.remove());
    actions.append(confirm, discard);
    form.append(actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void (async () => {
        const completed = selectMedication(candidate, form);
        if (!completed.nameZh || !completed.nameEn || !completed.strengthLabel || !completed.frequency) {
          progress.textContent = '请至少填写双语药名、规格与服用频率后再确认。';
          return;
        }
        try {
          await handlers.onConfirmMedication({ candidate: completed, file, pageCount, sourceId });
          card.remove();
          progress.textContent = '已将这条经确认的药物／用法保存在本机。';
        } catch (error) {
          progress.textContent = error instanceof Error ? error.message : '保存失败，请检查草稿。';
        }
      })();
    });
    card.append(form);
    review.append(card);
  }

  return panel;
}
