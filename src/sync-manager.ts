import * as chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import database from './database';
import presentationParser from './presentation-parser';
import type { SyncProgress, SyncStatus, PresentationData } from './types';

type ProgressCallback = (progress: SyncProgress) => void;

class SyncManager {
  private watchers = new Map<string, chokidar.FSWatcher>();
  private isInitialized = false;
  private syncInProgress = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await database.initialize();

    // Load watch directories from settings
    const watchDirs = await this.getWatchDirectories();
    for (const dir of watchDirs) {
      const dirPath = typeof dir === 'string' ? dir : dir.path;
      await this.addWatchDirectory(dirPath);
    }

    this.isInitialized = true;
  }

  async getWatchDirectories(): Promise<any[]> {
    try {
      const dirsJson = await database.getSetting('watch_directories');
      const dirs = dirsJson ? JSON.parse(dirsJson) : ['./data'];
      
      // Convert old string format to new object format
      return dirs.map((dir: any) => {
        if (typeof dir === 'string') {
          return { path: dir, priority: 'medium' };
        }
        return dir;
      });
    } catch (error) {
      console.error('Error loading watch directories:', error);
      return [{ path: './data', priority: 'medium' }];
    }
  }

  async setWatchDirectories(directories: any[]): Promise<boolean> {
    try {
      // Stop existing watchers
      this.stopAllWatchers();

      // Save to database
      await database.setSetting('watch_directories', JSON.stringify(directories));

      // Start new watchers
      for (const dir of directories) {
        const dirPath = typeof dir === 'string' ? dir : dir.path;
        await this.addWatchDirectory(dirPath);
      }

      return true;
    } catch (error) {
      console.error('Error setting watch directories:', error);
      throw error;
    }
  }

  async addWatchDirectory(directoryPath: string): Promise<boolean> {
    try {
      // Resolve relative paths
      const resolvedPath = path.resolve(directoryPath);

      // Check if directory exists
      if (!fs.existsSync(resolvedPath)) {
        console.warn(`Watch directory does not exist: ${resolvedPath}`);
        return false;
      }

      // Don't add if already watching
      if (this.watchers.has(resolvedPath)) {
        return true;
      }

      const watcher = chokidar.watch(resolvedPath, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true,
        depth: 10 // Reasonable depth limit
      });

      watcher
        .on('add', (filePath: string) => this.handleFileAdded(filePath))
        .on('change', (filePath: string) => this.handleFileChanged(filePath))
        .on('unlink', (filePath: string) => this.handleFileDeleted(filePath))
        .on('error', (error: unknown) => console.error(`Watcher error for ${resolvedPath}:`, error));

      this.watchers.set(resolvedPath, watcher);
      console.log(`Started watching directory: ${resolvedPath}`);

      return true;
    } catch (error) {
      console.error(`Error adding watch directory ${directoryPath}:`, error);
      return false;
    }
  }

  private async handleFileAdded(filePath: string): Promise<void> {
    if (presentationParser.isSupportedFile(filePath)) {
      console.log(`Presentation file added: ${filePath}`);
      await this.indexFile(filePath);
    }
  }

  private async handleFileChanged(filePath: string): Promise<void> {
    if (presentationParser.isSupportedFile(filePath)) {
      console.log(`Presentation file changed: ${filePath}`);
      await this.indexFile(filePath);
    }
  }

  private async handleFileDeleted(filePath: string): Promise<void> {
    if (presentationParser.isSupportedFile(filePath)) {
      console.log(`Presentation file deleted: ${filePath}`);
      await database.removePresentation(filePath);
    }
  }

  private async indexFile(filePath: string): Promise<void> {
    try {
      const presentation = await presentationParser.parsePresentationFile(filePath);
      await database.insertOrUpdatePresentation(presentation);
      console.log(`Indexed presentation: ${presentation.title}`);
    } catch (error) {
      console.error(`Error indexing file ${filePath}:`, error);
    }
  }

  async performFullSync(progressCallback?: ProgressCallback): Promise<{ total: number; processed: number }> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    this.syncInProgress = true;

    try {
      const watchDirs = await this.getWatchDirectories();
      let totalFiles = 0;
      let processedFiles = 0;

      // Count total files first
      for (const dir of watchDirs) {
        const dirPath = typeof dir === 'string' ? dir : dir.path;
        if (fs.existsSync(dirPath)) {
          const files = await presentationParser.getAllFiles(dirPath);
          totalFiles += files.filter(f => presentationParser.isSupportedFile(f)).length;
        }
      }

      if (progressCallback) {
        progressCallback({ total: totalFiles, processed: 0, current: 'Starting sync...' });
      }

      // Process each directory
      for (const dir of watchDirs) {
        const dirPath = typeof dir === 'string' ? dir : dir.path;
        if (!fs.existsSync(dirPath)) {
          console.warn(`Skipping non-existent directory: ${dirPath}`);
          continue;
        }

        console.log(`Syncing directory: ${dirPath}`);
        const presentations = await presentationParser.parseDirectory(dirPath);

        for (const presentation of presentations) {
          try {
            await database.insertOrUpdatePresentation(presentation);
            processedFiles++;

            if (progressCallback) {
              progressCallback({
                total: totalFiles,
                processed: processedFiles,
                current: `Processed: ${presentation.title}`
              });
            }
          } catch (error) {
            console.error(`Error saving presentation ${presentation.path}:`, { error, presentation });
          }
        }
      }

      console.log(`Sync completed. Processed ${processedFiles} files.`);
      return { total: totalFiles, processed: processedFiles };

    } catch (error) {
      console.error('Error during full sync:', error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  stopAllWatchers(): void {
    for (const [path, watcher] of this.watchers) {
      watcher.close();
      console.log(`Stopped watching directory: ${path}`);
    }
    this.watchers.clear();
  }

  async close(): Promise<void> {
    this.stopAllWatchers();
    this.isInitialized = false;
  }

  getSyncStatus(): SyncStatus {
    return {
      inProgress: this.syncInProgress,
      watchedDirectories: Array.from(this.watchers.keys()),
      isInitialized: this.isInitialized
    };
  }
}

export default new SyncManager();