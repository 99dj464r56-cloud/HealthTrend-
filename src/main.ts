import './styles.css';
import { loadHealthRecord } from './storage/indexedDb';
import type { HealthRecord } from './domain/types';
import { createPrivacyNotice } from './ui/privacyNotice';

function makeElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

function renderApp(record: HealthRecord | null): HTMLElement {
  const page = makeElement('main', 'page-shell');
  const header = makeElement('header', 'topbar');
  const brand = makeElement('div', 'brand-lockup');
  const brandMark = makeElement('span', 'brand-mark');
  brandMark.setAttribute('aria-hidden', 'true');
  const brandText = makeElement('div');
  const title = makeElement('h1');
  title.textContent = 'Health Trend PDF';
  const subtitle = makeElement('p', 'brand-subtitle');
  subtitle.textContent = '个人健康记录 · Medication & lab trends';
  brandText.append(title, subtitle);
  brand.append(brandMark, brandText);

  const deviceBadge = makeElement('span', 'device-badge');
  deviceBadge.textContent = '本机保存';
  header.append(brand, deviceBadge);

  const content = makeElement('div', 'content-column');
  const intro = makeElement('section', 'page-intro');
  const overline = makeElement('p', 'eyebrow');
  overline.textContent = 'YOUR HEALTH, IN ONE CLEAR VIEW';
  const introTitle = makeElement('h2');
  introTitle.textContent = '把检查结果，变成看得懂的变化';
  const introCopy = makeElement('p');
  introCopy.textContent = '整理药物与历次检查指标，生成适合保存、比较和打印的双语趋势报告。';
  intro.append(overline, introTitle, introCopy);

  const privacy = createPrivacyNotice();
  const recordCard = makeElement('section', 'record-card');
  recordCard.setAttribute('aria-labelledby', 'record-state-title');
  const cardHeading = makeElement('div', 'record-card-heading');
  const cardTitle = makeElement('h2');
  cardTitle.id = 'record-state-title';
  const cardNote = makeElement('p', 'muted');

  if (record === null) {
    cardTitle.textContent = '还没有健康记录';
    cardNote.textContent = '从药物资料或检查报告开始，手动输入或拍照导入都可以。';
    const action = makeElement('button', 'primary-button');
    action.type = 'button';
    action.dataset.action = 'start';
    action.textContent = '开始整理';
    cardHeading.append(cardTitle, cardNote);
    recordCard.append(cardHeading, action);
  } else {
    cardTitle.textContent = '你的记录已保存在此浏览器';
    cardNote.textContent = `${record.medications.length} 种药物 · ${record.observations.length} 条检查结果`;
    cardHeading.append(cardTitle, cardNote);
    recordCard.append(cardHeading);
  }

  const footer = makeElement('footer', 'page-footer');
  footer.textContent = '仅用于整理个人记录；检查参考范围请以原报告为准，医疗决定请咨询专业人员。';
  content.append(intro, privacy, recordCard, footer);
  page.append(header, content);
  return page;
}

async function start(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('App root element is missing.');
  const record = await loadHealthRecord();
  root.replaceChildren(renderApp(record));
}

void start();
