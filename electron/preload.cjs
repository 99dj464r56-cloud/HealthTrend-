const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('healthTrendNative', {
  platform: process.platform,
  backupStatus: () => ipcRenderer.invoke('backup:status'),
  chooseBackupDir: () => ipcRenderer.invoke('backup:choose-dir'),
  readBackup: () => ipcRenderer.invoke('backup:read'),
  writeBackup: (text) => ipcRenderer.invoke('backup:write', text),
  touchIdAvailable: () => ipcRenderer.invoke('touchid:available'),
  touchIdEnroll: (rawB64) => ipcRenderer.invoke('touchid:enroll', rawB64),
  touchIdUnlock: () => ipcRenderer.invoke('touchid:unlock'),
  touchIdClear: () => ipcRenderer.invoke('touchid:clear'),
  printReport: () => ipcRenderer.invoke('print:report'),
});
