/* preload.js — the only bridge between the UI and the main process. */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = ['status', 'chooseDbDir', 'setDbDir', 'db', 'setLogo', 'exportStudents', 'saveImage', 'backupDb', 'restoreDb', 'showDbFolder', 'login', 'logout', 'printPage', 'savePdf', 'saveImages', 'importFile', 'importTemplate', 'uploadStudentDocs', 'viewStudentDocument', 'saveStudentDocument'];

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => {
    if (!CHANNELS.includes(channel)) return Promise.resolve({ ok: false, error: 'Blocked channel.' });
    return ipcRenderer.invoke(channel, ...args);
  }
});
