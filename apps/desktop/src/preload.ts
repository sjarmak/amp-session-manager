import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: process.versions
});

declare global {
  interface Window {
    electronAPI: {
      platform: string;
      versions: NodeJS.ProcessVersions;
    };
  }
}
