import * as chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import database from './database';
import presentationParser from './presentation-parser';
import { WorkerPool } from './worker-pool';
import type { SyncProgress, SyncStatus, PresentationData } from './types';

type ProgressCallback = (progress: SyncProgress) => void;

class SyncManager {
  private watchers = new Map<string, chokidar.FSWatcher>();
  private isInitialized = false;
  private syncInProgress = false;
  private workerPool: WorkerPool | null = null;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await database.initialize();

    // Initialize worker pool
    this.workerPool = new WorkerPool();
    await this.workerPool.initialize();

    // Load watch directories from database
    const watchDirs = await this.getWatchDirectories();
    for (const dirPath of watchDirs) {
      await this.addWatchDirectory(dirPath);
    }

    this.isInitialized = true;
  }

  async getWatchDirectories(): Promise<string[]> {
    try {
      // Get all folder paths from the new category-based structure
      return await database.getAllFolderPaths();
    } catch (error) {
      console.error('Error loading watch directories:', error);
      return [];
    }
  }

  async refreshWatchers(): Promise<boolean> {
    try {
      console.log('Refreshing watchers from database...');
      
      // Stop existing watchers
      this.stopAllWatchers();

      // Get current folder paths and start watchers
      const directories = await this.getWatchDirectories();
      for (const dirPath of directories) {
        console.log('Adding watch directory:', dirPath);
        await this.addWatchDirectory(dirPath);
      }

      console.log('All watchers refreshed successfully');
      return true;
    } catch (error) {
      console.error('Error refreshing watchers:', error);
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

    if (!this.workerPool) {
      throw new Error('Worker pool not initialized');
    }

    this.syncInProgress = true;

    try {
      const watchDirs = await this.getWatchDirectories();
      const allFiles: string[] = [];

      // Collect all supported files from all directories
      for (const dirPath of watchDirs) {
        if (!fs.existsSync(dirPath)) {
          console.warn(`Skipping non-existent directory: ${dirPath}`);
          continue;
        }

        console.log(`Scanning directory: ${dirPath}`);
        const files = await presentationParser.getAllFiles(dirPath);
        const supportedFiles = files.filter(f => presentationParser.isSupportedFile(f));
        allFiles.push(...supportedFiles);
      }

      const totalFiles = allFiles.length;
      let processedFiles = 0;
      let savedFiles = 0;

      if (progressCallback) {
        progressCallback({ total: totalFiles, processed: 0, current: 'Starting parallel processing...' });
      }

      console.log(`Starting parallel processing of ${totalFiles} files with worker pool`);

      // Process files in batches for memory efficiency
      const batchSize = 50; // Process 50 files at a time
      const batches = this.chunkArray(allFiles, batchSize);

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} files)`);

        // Process batch in parallel using worker pool
        const batchPromises = batch.map(async (filePath) => {
          try {
            const presentation = await this.workerPool!.processFile(filePath);
            processedFiles++;

            if (progressCallback) {
              progressCallback({
                total: totalFiles,
                processed: processedFiles,
                current: `Processed: ${presentation.title || path.basename(filePath)}`
              });
            }

            return presentation;
          } catch (error) {
            console.error(`Error processing file ${filePath}:`, error);
            processedFiles++;

            if (progressCallback) {
              progressCallback({
                total: totalFiles,
                processed: processedFiles,
                current: `Error: ${path.basename(filePath)}`
              });
            }

            return null;
          }
        });

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);

        // Filter out errors and prepare for batch database insert
        const validPresentations = batchResults.filter((p): p is PresentationData => p !== null);

        if (validPresentations.length > 0) {
          try {
            // Batch insert to database
            const inserted = await database.insertOrUpdatePresentationBatch(validPresentations);
            savedFiles += inserted;

            console.log(`Batch ${batchIndex + 1}: Saved ${inserted}/${batch.length} presentations to database`);

            if (progressCallback) {
              progressCallback({
                total: totalFiles,
                processed: processedFiles,
                current: `Saved batch ${batchIndex + 1}/${batches.length} to database`
              });
            }
          } catch (error) {
            console.error(`Error saving batch ${batchIndex + 1} to database:`, error);
          }
        }

        // Log worker pool stats
        const stats = this.workerPool.getStats();
        console.log(`Worker pool stats: ${stats.busyWorkers}/${stats.totalWorkers} busy, ${stats.queueLength} queued`);
      }

      console.log(`Sync completed. Processed ${processedFiles}/${totalFiles} files, saved ${savedFiles} presentations.`);
      return { total: totalFiles, processed: savedFiles };

    } catch (error) {
      console.error('Error during full sync:', error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
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

    // Terminate worker pool
    if (this.workerPool) {
      await this.workerPool.terminate();
      this.workerPool = null;
    }

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
