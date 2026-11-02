const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  // reminder overlay (dog.html, ghost.html)
  respond: (action) => ipcRenderer.send('overlay:respond', action),
  setIgnoreMouse: (ignore) => ipcRenderer.send('overlay:ignore-mouse', ignore),
  onLeave: (fn) => ipcRenderer.on('overlay:leave', (_e, action) => fn(action || 'snooze')), // 'call' or 'snooze'
  // settings window
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
});
