import { parentPort, workerData } from 'worker_threads';
import presentationParser from './presentation-parser';
import type { PresentationData } from './types';

interface WorkerTask {
  id: string;
  filePath: string;
}

interface WorkerResult {
  id: string;
  success: boolean;
  data?: PresentationData;
  error?: string;
}

// Handle messages from main thread
if (parentPort) {
  parentPort.on('message', async (task: WorkerTask) => {
    try {
      console.log(`Worker processing: ${task.filePath}`);
      
      // Parse the presentation file
      const data = await presentationParser.parsePresentationFile(task.filePath);
      
      const result: WorkerResult = {
        id: task.id,
        success: true,
        data
      };
      
      parentPort!.postMessage(result);
    } catch (error) {
      console.error(`Worker error processing ${task.filePath}:`, error);
      
      const result: WorkerResult = {
        id: task.id,
        success: false,
        error: (error as Error).message
      };
      
      parentPort!.postMessage(result);
    }
  });
  
  // Signal that worker is ready
  parentPort.postMessage({ ready: true });
}