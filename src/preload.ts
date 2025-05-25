import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  searchPresentations: (query: string, options?: any) => ipcRenderer.invoke('search-presentations', query, options),
  getAllPresentations: (orderBy?: string, limit?: number) => ipcRenderer.invoke('get-all-presentations', orderBy, limit),
  updateViewCount: (path: string) => ipcRenderer.invoke('update-view-count', path),
  toggleFavorite: (path: string) => ipcRenderer.invoke('toggle-favorite', path),
  openPresentation: (path: string) => ipcRenderer.invoke('open-presentation', path),
  getCategories: () => ipcRenderer.invoke('get-categories'),
  createCategory: (name: string, orderIndex?: number) => ipcRenderer.invoke('create-category', name, orderIndex),
  updateCategory: (id: number, name?: string, orderIndex?: number) => ipcRenderer.invoke('update-category', id, name, orderIndex),
  deleteCategory: (id: number) => ipcRenderer.invoke('delete-category', id),
  addFolderToCategory: (categoryId: number, path: string, name?: string) => ipcRenderer.invoke('add-folder-to-category', categoryId, path, name),
  removeFolderFromCategory: (folderId: number) => ipcRenderer.invoke('remove-folder-from-category', folderId),
  performFullSync: () => ipcRenderer.invoke('perform-full-sync'),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  recoverDatabase: () => ipcRenderer.invoke('recover-database'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
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
      getCategories: () => Promise<any[]>;
      createCategory: (name: string, orderIndex?: number) => Promise<number>;
      updateCategory: (id: number, name?: string, orderIndex?: number) => Promise<number>;
      deleteCategory: (id: number) => Promise<number>;
      addFolderToCategory: (categoryId: number, path: string, name?: string) => Promise<number>;
      removeFolderFromCategory: (folderId: number) => Promise<number>;
      performFullSync: () => Promise<{ total: number; processed: number }>;
      getSyncStatus: () => Promise<{ inProgress: boolean; watchedDirectories: string[]; isInitialized: boolean }>;
      recoverDatabase: () => Promise<boolean>;
      selectFolder: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      onSyncProgress: (callback: (progress: any) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}