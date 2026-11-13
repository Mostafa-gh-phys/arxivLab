const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('arxivlabDesktop', {
  isDesktop: true,
  platform: process.platform,
});
