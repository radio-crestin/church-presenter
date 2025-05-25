import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import type { PresentationData } from './types';

interface Task {
  id: string;
  filePath: string;
  resolve: (data: PresentationData) => void;
  reject: (error: Error) => void;
}

interface WorkerInstance {
  worker: Worker;
  busy: boolean;
  currentTask?: Task;
}

export class WorkerPool {
  private workers: WorkerInstance[] = [];
  private taskQueue: Task[] = [];
  private readonly maxWorkers: number;
  private readonly workerScript: string;
  private taskIdCounter = 0;

  constructor(maxWorkers?: number) {
    // Use number of CPU cores, but limit to reasonable range
    this.maxWorkers = maxWorkers || Math.min(Math.max(os.cpus().length - 1, 2), 6);
    this.workerScript = path.join(__dirname, 'presentation-worker.js');
    console.log(`WorkerPool: Using ${this.maxWorkers} workers`);
  }

  async initialize(): Promise<void> {
    console.log('Initializing worker pool...');
    
    const workerPromises = Array.from({ length: this.maxWorkers }, () => this.createWorker());
    await Promise.all(workerPromises);
    
    console.log(`Worker pool initialized with ${this.workers.length} workers`);
  }

  private async createWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(this.workerScript);
        
        const workerInstance: WorkerInstance = {
          worker,
          busy: false
        };

        // Handle worker messages
        worker.on('message', (result: any) => {
          if (result.ready) {
            // Worker is ready
            this.workers.push(workerInstance);
            resolve();
            return;
          }

          // Handle task completion
          if (workerInstance.currentTask) {
            const task = workerInstance.currentTask;
            workerInstance.busy = false;
            workerInstance.currentTask = undefined;

            if (result.success) {
              task.resolve(result.data);
            } else {
              task.reject(new Error(result.error || 'Unknown worker error'));
            }

            // Process next task in queue
            this.processNextTask();
          }
        });

        worker.on('error', (error) => {
          console.error('Worker error:', error);
          if (workerInstance.currentTask) {
            workerInstance.currentTask.reject(error);
            workerInstance.currentTask = undefined;
          }
          // Remove failed worker
          this.removeWorker(workerInstance);
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            console.error(`Worker stopped with exit code ${code}`);
          }
          this.removeWorker(workerInstance);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  private removeWorker(workerInstance: WorkerInstance): void {
    const index = this.workers.indexOf(workerInstance);
    if (index !== -1) {
      this.workers.splice(index, 1);
    }
  }

  async processFile(filePath: string): Promise<PresentationData> {
    return new Promise((resolve, reject) => {
      const task: Task = {
        id: `task_${++this.taskIdCounter}`,
        filePath,
        resolve,
        reject
      };

      this.taskQueue.push(task);
      this.processNextTask();
    });
  }

  private processNextTask(): void {
    if (this.taskQueue.length === 0) return;

    // Find available worker
    const availableWorker = this.workers.find(w => !w.busy);
    if (!availableWorker) return;

    // Get next task
    const task = this.taskQueue.shift();
    if (!task) return;

    // Assign task to worker
    availableWorker.busy = true;
    availableWorker.currentTask = task;

    // Send task to worker
    availableWorker.worker.postMessage({
      id: task.id,
      filePath: task.filePath
    });
  }

  async terminate(): Promise<void> {
    console.log('Terminating worker pool...');
    
    const terminationPromises = this.workers.map(workerInstance =>
      workerInstance.worker.terminate()
    );
    
    await Promise.all(terminationPromises);
    this.workers = [];
    this.taskQueue = [];
    
    console.log('Worker pool terminated');
  }

  getStats(): { totalWorkers: number; busyWorkers: number; queueLength: number } {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      queueLength: this.taskQueue.length
    };
  }
}