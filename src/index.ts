import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import path from 'path';
import database from './database';
import syncManager from './sync-manager';
import type { SyncProgress } from './types';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = (): void => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// Initialize database and sync manager
async function initializeApp(): Promise<void> {
  try {
    await database.initialize();
    await syncManager.initialize();
    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    throw error;
  }
}

// IPC Handlers
ipcMain.handle('search-presentations', async (event: IpcMainInvokeEvent, query: string, options?: any) => {
  try {
    return await database.searchPresentations(query, options);
  } catch (error) {
    console.error('Error searching presentations:', error);
    throw error;
  }
});

ipcMain.handle('get-all-presentations', async (event: IpcMainInvokeEvent, orderBy?: string, limit?: number) => {
  try {
    return await database.getAllPresentations(orderBy, limit);
  } catch (error) {
    console.error('Error getting presentations:', error);
    throw error;
  }
});

ipcMain.handle('update-view-count', async (event: IpcMainInvokeEvent, path: string) => {
  try {
    return await database.updateViewCount(path);
  } catch (error) {
    console.error('Error updating view count:', error);
    throw error;
  }
});

ipcMain.handle('toggle-favorite', async (event: IpcMainInvokeEvent, path: string) => {
  try {
    return await database.toggleFavorite(path);
  } catch (error) {
    console.error('Error toggling favorite:', error);
    throw error;
  }
});

ipcMain.handle('open-presentation', async (event: IpcMainInvokeEvent, presentationPath: string) => {
  try {
    // Update view count first
    await database.updateViewCount(presentationPath);
    
    // Open the presentation with the default application
    await shell.openPath(presentationPath);
    
    return { success: true };
  } catch (error) {
    console.error('Error opening presentation:', error);
    throw error;
  }
});

ipcMain.handle('get-watch-directories', async () => {
  try {
    return await syncManager.getWatchDirectories();
  } catch (error) {
    console.error('Error getting watch directories:', error);
    throw error;
  }
});

ipcMain.handle('set-watch-directories', async (event: IpcMainInvokeEvent, directories: string[]) => {
  try {
    return await syncManager.setWatchDirectories(directories);
  } catch (error) {
    console.error('Error setting watch directories:', error);
    throw error;
  }
});

ipcMain.handle('perform-full-sync', async (event: IpcMainInvokeEvent) => {
  try {
    return await syncManager.performFullSync((progress: SyncProgress) => {
      event.sender.send('sync-progress', progress);
    });
  } catch (error) {
    console.error('Error performing full sync:', error);
    throw error;
  }
});

ipcMain.handle('get-sync-status', () => {
  return syncManager.getSyncStatus();
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  try {
    await initializeApp();
    createWindow();

    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('Failed to start application:', error);
    app.quit();
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up when app is quitting
app.on('before-quit', async () => {
  await syncManager.close();
  await database.close();
});