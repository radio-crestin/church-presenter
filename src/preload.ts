import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  searchPresentations: (query: string, options?: any) => ipcRenderer.invoke('search-presentations', query, options),
  getAllPresentations: (orderBy?: string, limit?: number) => ipcRenderer.invoke('get-all-presentations', orderBy, limit),
  updateViewCount: (path: string) => ipcRenderer.invoke('update-view-count', path),
  toggleFavorite: (path: string) => ipcRenderer.invoke('toggle-favorite', path),
  openPresentation: (path: string) => ipcRenderer.invoke('open-presentation', path),
  getWatchDirectories: () => ipcRenderer.invoke('get-watch-directories'),
  setWatchDirectories: (directories: any[]) => ipcRenderer.invoke('set-watch-directories', directories),
  performFullSync: () => ipcRenderer.invoke('perform-full-sync'),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  recoverDatabase: () => ipcRenderer.invoke('recover-database'),
  onSyncProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('sync-progress', (event: IpcRendererEvent, progress: any) => callback(progress));
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      searchPresentations: (query: string, options?: any) => Promise<any[]>;
      getAllPresentations: (orderBy?: string, limit?: number) => Promise<any[]>;
      updateViewCount: (path: string) => Promise<number>;
      toggleFavorite: (path: string) => Promise<number>;
      openPresentation: (path: string) => Promise<{ success: boolean }>;
      getWatchDirectories: () => Promise<any[]>;
      setWatchDirectories: (directories: any[]) => Promise<boolean>;
      performFullSync: () => Promise<{ total: number; processed: number }>;
      getSyncStatus: () => Promise<{ inProgress: boolean; watchedDirectories: string[]; isInitialized: boolean }>;
      recoverDatabase: () => Promise<boolean>;
      onSyncProgress: (callback: (progress: any) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}