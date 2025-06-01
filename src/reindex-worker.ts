import { parentPort, workerData } from 'worker_threads';
import presentationParser from './presentation-parser';
import type { PresentationData } from './types';

interface ReindexTask {
  id: string;
  filePath: string;
}

interface ReindexResult {
  id: string;
  success: boolean;
  data?: PresentationData;
  error?: string;
  processingTime?: number;
}

const workerId = workerData?.workerId || 0;

// Handle messages from main thread
if (parentPort) {
  parentPort.on('message', async (task: ReindexTask) => {
    const startTime = Date.now();
    
    try {
      console.log(`Reindex worker ${workerId} processing: ${task.filePath}`);
      
      // Parse the presentation file with enhanced error handling
      const data = await presentationParser.parsePresentationFile(task.filePath);
      
      const processingTime = Date.now() - startTime;
      
      const result: ReindexResult = {
        id: task.id,
        success: true,
        data,
        processingTime
      };
      
      parentPort!.postMessage(result);
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Reindex worker ${workerId} error processing ${task.filePath}:`, error);
      
      const result: ReindexResult = {
        id: task.id,
        success: false,
        error: (error as Error).message,
        processingTime
      };
      
      parentPort!.postMessage(result);
    }
  });
  
  // Signal that worker is ready
  parentPort.postMessage({ ready: true });
  console.log(`Reindex worker ${workerId} initialized and ready`);
}
