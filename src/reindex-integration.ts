import { ipcMain } from 'electron';
import database from './database';
import reindexManager from './reindex-manager';

interface ReindexRequest {
  directories: string[];
  options?: {
    maxWorkers?: number;
    batchSize?: number;
    prioritizeRecent?: boolean;
  };
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

interface ReindexResult {
  success: boolean;
  processed: number;
  errors: number;
  timeMs: number;
  averageSpeed?: number;
}

export class ReindexIntegration {
  private isReindexing = false;

  initialize(): void {
    console.log('Initializing reindex integration...');

    // Handle reindex start request
    ipcMain.handle('reindex:start', async (event, request: ReindexRequest): Promise<{ success: boolean; error?: string }> => {
      try {
        if (this.isReindexing) {
          return { success: false, error: 'Reindex operation already in progress' };
        }

        console.log('Starting reindex operation from IPC request');
        this.isReindexing = true;

        // Set up progress forwarding
        const progressHandler = (progress: ReindexProgress) => {
          event.sender.send('reindex:progress', progress);
        };

        const batchHandler = (info: any) => {
          event.sender.send('reindex:batch-flushed', info);
        };

        const errorHandler = (error: any) => {
          event.sender.send('reindex:error', error);
          this.isReindexing = false;
        };

        const completedHandler = (result: ReindexResult) => {
          event.sender.send('reindex:completed', result);
          this.isReindexing = false;
          this.cleanup();
        };

        // Attach event listeners
        reindexManager.on('progress', progressHandler);
        reindexManager.on('batchFlushed', batchHandler);
        reindexManager.on('error', errorHandler);
        reindexManager.once('completed', completedHandler);

        // Start the reindex operation
        await reindexManager.startReindex(request.directories, request.options || {});

        return { success: true };

      } catch (error) {
        console.error('Failed to start reindex operation:', error);
        this.isReindexing = false;
        return { success: false, error: (error as Error).message };
      }
    });

    // Handle reindex pause request
    ipcMain.handle('reindex:pause', async (): Promise<{ success: boolean }> => {
      try {
        reindexManager.pauseReindex();
        return { success: true };
      } catch (error) {
        console.error('Failed to pause reindex:', error);
        return { success: false };
      }
    });

    // Handle reindex resume request
    ipcMain.handle('reindex:resume', async (): Promise<{ success: boolean }> => {
      try {
        reindexManager.resumeReindex();
        return { success: true };
      } catch (error) {
        console.error('Failed to resume reindex:', error);
        return { success: false };
      }
    });

    // Handle reindex stop request
    ipcMain.handle('reindex:stop', async (): Promise<{ success: boolean }> => {
      try {
        await reindexManager.stopReindex();
        this.isReindexing = false;
        this.cleanup();
        return { success: true };
      } catch (error) {
        console.error('Failed to stop reindex:', error);
        return { success: false };
      }
    });

    // Handle reindex status request
    ipcMain.handle('reindex:status', async (): Promise<{ 
      isRunning: boolean; 
      progress?: ReindexProgress; 
      workerStats?: any[] 
    }> => {
      try {
        return {
          isRunning: this.isReindexing,
          progress: this.isReindexing ? reindexManager.getProgress() : undefined,
          workerStats: this.isReindexing ? reindexManager.getWorkerStats() : undefined
        };
      } catch (error) {
        console.error('Failed to get reindex status:', error);
        return { isRunning: false };
      }
    });

    // Handle database reindex request (simpler interface)
    ipcMain.handle('database:reindex', async (event, directories: string[], options?: any): Promise<ReindexResult> => {
      try {
        console.log('Starting database reindex operation');
        const result = await database.reindexDatabase(directories, options);
        console.log('Database reindex completed:', result);
        return result;
      } catch (error) {
        console.error('Database reindex failed:', error);
        return {
          success: false,
          processed: 0,
          errors: 1,
          timeMs: 0
        };
      }
    });

    console.log('Reindex integration initialized');
  }

  private cleanup(): void {
    // Remove all event listeners to prevent memory leaks
    reindexManager.removeAllListeners('progress');
    reindexManager.removeAllListeners('batchFlushed');
    reindexManager.removeAllListeners('error');
    reindexManager.removeAllListeners('completed');
  }

  async terminate(): Promise<void> {
    console.log('Terminating reindex integration...');
    
    if (this.isReindexing) {
      await reindexManager.stopReindex();
      this.isReindexing = false;
    }
    
    this.cleanup();
    
    // Remove IPC handlers
    ipcMain.removeHandler('reindex:start');
    ipcMain.removeHandler('reindex:pause');
    ipcMain.removeHandler('reindex:resume');
    ipcMain.removeHandler('reindex:stop');
    ipcMain.removeHandler('reindex:status');
    ipcMain.removeHandler('database:reindex');
    
    console.log('Reindex integration terminated');
  }
}

export default new ReindexIntegration();
