/** One-line local-only reminder — keep UI chrome short. */
export function createPrivacyNotice(): HTMLElement {
  const section = document.createElement('p');
  section.className = 'privacy-notice privacy-notice-compact';
  section.textContent = '资料仅保存在本浏览器，不会上传。iPhone／iPad：Safari 分享 →「添加到主屏幕」可像 App 一样打开；个人档案请用「备份到 iCloud」保存加密文件。';
  return section;
}
