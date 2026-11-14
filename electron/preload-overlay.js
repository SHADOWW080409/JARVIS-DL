const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  bbox: (r) => ipcRenderer.send('circle:bbox', r),
});
