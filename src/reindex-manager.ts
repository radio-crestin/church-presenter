import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import fs from 'fs';
import presentationParser from './presentation-parser';
import database, { PresentationData } from './database';

interface ReindexTask {
  id: string;
  filePath: string;
  priority: number; // Higher number = higher priority
}

interface ReindexWorkerInstance {
  worker: Worker;
  busy: boolean;
  currentTask?: ReindexTask;
  processedCount: number;
  errorCount: number;
}

interface ReindexProgress {
  totalFiles: number;
  processedFiles: number;
  successfulFiles: number;
  failedFiles: number;
  currentFile: string;
  estimatedTimeRemaining: number;
  filesPerSecond: number;
  batchesFlushed: number;
  workersActive: number;
}

interface ReindexOptions {
  maxWorkers?: number;
  batchSize?: number;
  flushIntervalMs?: number;
  prioritizeRecent?: boolean;
  skipExisting?: boolean;
}

export class ReindexManager extends EventEmitter {
  private workers: ReindexWorkerInstance[] = [];
  private taskQueue: ReindexTask[] = [];
  private pendingBatch: PresentationData[] = [];
  private readonly maxWorkers: number;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly workerScript: string;
  
  private isRunning = false;
  private isPaused = false;
  private taskIdCounter = 0;
  private startTime = 0;
  private lastFlushTime = 0;
  private flushTimer?: NodeJS.Timeout;
  
  private progress: ReindexProgress = {
    totalFiles: 0,
    processedFiles: 0,
    successfulFiles: 0,
    failedFiles: 0,
    currentFile: '',
    estimatedTimeRemaining: 0,
    filesPerSecond: 0,
    batchesFlushed: 0,
    workersActive: 0
  };

  constructor(options: ReindexOptions = {}) {
    super();
    
    // Configure worker pool - use more workers for I/O intensive tasks
    this.maxWorkers = options.maxWorkers || Math.min(Math.max(os.cpus().length, 8), 16);
    
    // Configure batching - larger batches for better database performance
    this.batchSize = options.batchSize || 50;
    this.flushIntervalMs = options.flushIntervalMs || 5000; // 5 seconds
    
    this.workerScript = path.join(__dirname, 'reindex-worker.js');
    
    console.log(`ReindexManager: Configured with ${this.maxWorkers} workers, batch size ${this.batchSize}, flush interval ${this.flushIntervalMs}ms`);
  }

  async initialize(): Promise<void> {
    if (this.workers.length > 0) {
      console.log('ReindexManager already initialized');
      return;
    }

    console.log('Initializing reindex manager...');
    
    try {
      // Create all workers in parallel
      const workerPromises = Array.from({ length: this.maxWorkers }, (_, index) => 
        this.createWorker(index)
      );
      
      await Promise.all(workerPromises);
      
      console.log(`ReindexManager initialized with ${this.workers.length} workers`);
      this.emit('initialized', { workerCount: this.workers.length });
      
    } catch (error) {
      console.error('Failed to initialize reindex manager:', error);
      throw error;
    }
  }

  private async createWorker(workerId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(this.workerScript, {
          workerData: { workerId }
        });
        
        const workerInstance: ReindexWorkerInstance = {
          worker,
          busy: false,
          processedCount: 0,
          errorCount: 0
        };

        // Handle worker messages
        worker.on('message', (result: any) => {
          if (result.ready) {
            // Worker is ready
            this.workers.push(workerInstance);
            console.log(`Reindex worker ${workerId} ready`);
            resolve();
            return;
          }

          // Handle task completion
          if (workerInstance.currentTask) {
            this.handleTaskCompletion(workerInstance, result);
          }
        });

        worker.on('error', (error) => {
          console.error(`Reindex worker ${workerId} error:`, error);
          this.handleWorkerError(workerInstance, error);
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            console.error(`Reindex worker ${workerId} stopped with exit code ${code}`);
          }
          this.removeWorker(workerInstance);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleTaskCompletion(workerInstance: ReindexWorkerInstance, result: any): void {
    const task = workerInstance.currentTask!;
    workerInstance.busy = false;
    workerInstance.currentTask = undefined;

    if (result.success) {
      workerInstance.processedCount++;
      this.progress.successfulFiles++;
      
      // Add to pending batch
      this.pendingBatch.push(result.data);
      
      // Check if we should flush the batch
      if (this.pendingBatch.length >= this.batchSize) {
        this.flushBatch();
      }
      
    } else {
      workerInstance.errorCount++;
      this.progress.failedFiles++;
      console.error(`Failed to process ${task.filePath}: ${result.error}`);
    }

    this.progress.processedFiles++;
    this.progress.currentFile = task.filePath;
    this.updateProgress();
    
    // Process next task
    this.processNextTask();
  }

  private handleWorkerError(workerInstance: ReindexWorkerInstance, error: Error): void {
    if (workerInstance.currentTask) {
      this.progress.failedFiles++;
      this.progress.processedFiles++;
      console.error(`Worker error processing ${workerInstance.currentTask.filePath}:`, error);
    }
    
    workerInstance.errorCount++;
    this.removeWorker(workerInstance);
    
    // Try to recreate the worker
    this.createWorker(this.workers.length).catch(err => {
      console.error('Failed to recreate worker:', err);
    });
  }

  private removeWorker(workerInstance: ReindexWorkerInstance): void {
    const index = this.workers.indexOf(workerInstance);
    if (index !== -1) {
      this.workers.splice(index, 1);
    }
  }

  async startReindex(directories: string[], options: ReindexOptions = {}): Promise<void> {
    if (this.isRunning) {
      throw new Error('Reindex is already running');
    }

    console.log('Starting reindex operation...');
    this.isRunning = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this.lastFlushTime = this.startTime;
    
    // Reset progress
    this.progress = {
      totalFiles: 0,
      processedFiles: 0,
      successfulFiles: 0,
      failedFiles: 0,
      currentFile: '',
      estimatedTimeRemaining: 0,
      filesPerSecond: 0,
      batchesFlushed: 0,
      workersActive: 0
    };

    try {
      // Ensure workers are initialized
      await this.initialize();
      
      // Collect all files to process
      console.log('Scanning directories for presentation files...');
      const allFiles = await this.collectFiles(directories);
      
      if (allFiles.length === 0) {
        console.log('No presentation files found to index');
        this.isRunning = false;
        this.emit('completed', this.progress);
        return;
      }

      // Prioritize files if requested
      const prioritizedFiles = options.prioritizeRecent ? 
        this.prioritizeFilesByDate(allFiles) : allFiles;

      // Create tasks
      this.taskQueue = prioritizedFiles.map((filePath, index) => ({
        id: `reindex_${++this.taskIdCounter}`,
        filePath,
        priority: prioritizedFiles.length - index // Higher index = lower priority
      }));

      this.progress.totalFiles = this.taskQueue.length;
      
      console.log(`Starting reindex of ${this.progress.totalFiles} files with ${this.workers.length} workers`);
      this.emit('started', this.progress);

      // Start flush timer
      this.startFlushTimer();
      
      // Start processing tasks
      this.processAllTasks();
      
    } catch (error) {
      console.error('Error starting reindex:', error);
      this.isRunning = false;
      this.emit('error', error);
      throw error;
    }
  }

  private async collectFiles(directories: string[]): Promise<string[]> {
    const allFiles: string[] = [];
    
    for (const directory of directories) {
      try {
        if (!fs.existsSync(directory)) {
          console.warn(`Directory does not exist: ${directory}`);
          continue;
        }

        const files = await presentationParser.getAllFiles(directory);
        const supportedFiles = files.filter(file => presentationParser.isSupportedFile(file));
        
        allFiles.push(...supportedFiles);
        console.log(`Found ${supportedFiles.length} presentation files in ${directory}`);
        
      } catch (error) {
        console.error(`Error scanning directory ${directory}:`, error);
        this.emit('directoryError', { directory, error });
      }
    }
    
    // Remove duplicates
    return [...new Set(allFiles)];
  }

  private prioritizeFilesByDate(files: string[]): string[] {
    return files
      .map(filePath => {
        try {
          const stats = fs.statSync(filePath);
          return { filePath, mtime: stats.mtime.getTime() };
        } catch {
          return { filePath, mtime: 0 };
        }
      })
      .sort((a, b) => b.mtime - a.mtime) // Most recent first
      .map(item => item.filePath);
  }

  private processAllTasks(): void {
    // Start processing with all available workers
    for (let i = 0; i < this.workers.length && this.taskQueue.length > 0; i++) {
      this.processNextTask();
    }
  }

  private processNextTask(): void {
    if (!this.isRunning || this.isPaused || this.taskQueue.length === 0) {
      // Check if all work is done
      if (this.taskQueue.length === 0 && this.workers.every(w => !w.busy)) {
        this.completeReindex();
      }
      return;
    }

    // Find available worker
    const availableWorker = this.workers.find(w => !w.busy);
    if (!availableWorker) return;

    // Get highest priority task
    const taskIndex = this.taskQueue.findIndex(task => task.priority === Math.max(...this.taskQueue.map(t => t.priority)));
    if (taskIndex === -1) return;

    const task = this.taskQueue.splice(taskIndex, 1)[0];

    // Assign task to worker
    availableWorker.busy = true;
    availableWorker.currentTask = task;

    // Send task to worker
    availableWorker.worker.postMessage({
      id: task.id,
      filePath: task.filePath
    });
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.pendingBatch.length > 0) {
        this.flushBatch();
      }
    }, this.flushIntervalMs);
  }

  private async flushBatch(): Promise<void> {
    if (this.pendingBatch.length === 0) return;

    const batchToFlush = [...this.pendingBatch];
    this.pendingBatch = [];

    try {
      const startTime = Date.now();
      const inserted = await database.insertOrUpdatePresentationBatch(batchToFlush);
      const flushTime = Date.now() - startTime;
      
      this.progress.batchesFlushed++;
      this.lastFlushTime = Date.now();
      
      console.log(`Flushed batch of ${batchToFlush.length} presentations to database in ${flushTime}ms`);
      this.emit('batchFlushed', { 
        batchSize: batchToFlush.length, 
        inserted, 
        flushTime,
        totalBatches: this.progress.batchesFlushed 
      });
      
    } catch (error) {
      console.error('Error flushing batch to database:', error);
      // Put the batch back for retry
      this.pendingBatch.unshift(...batchToFlush);
      this.emit('batchError', { error, batchSize: batchToFlush.length });
    }
  }

  private updateProgress(): void {
    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000; // seconds
    
    this.progress.filesPerSecond = elapsed > 0 ? this.progress.processedFiles / elapsed : 0;
    this.progress.workersActive = this.workers.filter(w => w.busy).length;
    
    if (this.progress.filesPerSecond > 0) {
      const remaining = this.progress.totalFiles - this.progress.processedFiles;
      this.progress.estimatedTimeRemaining = remaining / this.progress.filesPerSecond;
    }
    
    // Emit progress update every 10 files or every 5 seconds
    if (this.progress.processedFiles % 10 === 0 || (now - this.lastFlushTime) > 5000) {
      this.emit('progress', { ...this.progress });
    }
  }

  private async completeReindex(): Promise<void> {
    console.log('Completing reindex operation...');
    
    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    // Flush any remaining items
    if (this.pendingBatch.length > 0) {
      await this.flushBatch();
    }
    
    this.isRunning = false;
    
    const totalTime = (Date.now() - this.startTime) / 1000;
    console.log(`Reindex completed in ${totalTime.toFixed(2)} seconds`);
    console.log(`Processed: ${this.progress.processedFiles}/${this.progress.totalFiles} files`);
    console.log(`Success: ${this.progress.successfulFiles}, Failed: ${this.progress.failedFiles}`);
    console.log(`Batches flushed: ${this.progress.batchesFlushed}`);
    console.log(`Average speed: ${this.progress.filesPerSecond.toFixed(2)} files/second`);
    
    this.emit('completed', { 
      ...this.progress, 
      totalTime,
      averageSpeed: this.progress.filesPerSecond 
    });
  }

  pauseReindex(): void {
    if (!this.isRunning || this.isPaused) return;
    
    this.isPaused = true;
    console.log('Reindex paused');
    this.emit('paused', this.progress);
  }

  resumeReindex(): void {
    if (!this.isRunning || !this.isPaused) return;
    
    this.isPaused = false;
    console.log('Reindex resumed');
    this.processAllTasks();
    this.emit('resumed', this.progress);
  }

  async stopReindex(): Promise<void> {
    if (!this.isRunning) return;
    
    console.log('Stopping reindex operation...');
    this.isRunning = false;
    this.isPaused = false;
    
    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    // Flush any remaining items
    if (this.pendingBatch.length > 0) {
      await this.flushBatch();
    }
    
    // Clear task queue
    this.taskQueue = [];
    
    console.log('Reindex stopped');
    this.emit('stopped', this.progress);
  }

  getProgress(): ReindexProgress {
    return { ...this.progress };
  }

  getWorkerStats(): Array<{ workerId: number; busy: boolean; processed: number; errors: number }> {
    return this.workers.map((worker, index) => ({
      workerId: index,
      busy: worker.busy,
      processed: worker.processedCount,
      errors: worker.errorCount
    }));
  }

  async terminate(): Promise<void> {
    console.log('Terminating reindex manager...');
    
    await this.stopReindex();
    
    // Terminate all workers
    const terminationPromises = this.workers.map(workerInstance =>
      workerInstance.worker.terminate()
    );
    
    await Promise.all(terminationPromises);
    this.workers = [];
    
    console.log('Reindex manager terminated');
    this.emit('terminated');
  }
}

export default new ReindexManager();
