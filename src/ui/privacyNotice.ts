export function createPrivacyNotice(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'privacy-notice';
  section.setAttribute('aria-labelledby', 'privacy-title');

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'LOCAL-FIRST · 本机优先';

  const heading = document.createElement('h2');
  heading.id = 'privacy-title';
  heading.textContent = '你的资料只保存在此设备';

  const copy = document.createElement('p');
  copy.textContent = '药物和检查资料在本浏览器内处理，不会上传到服务器。换设备或清除浏览器数据前，请先导出备份。';

  section.append(eyebrow, heading, copy);
  return section;
}
