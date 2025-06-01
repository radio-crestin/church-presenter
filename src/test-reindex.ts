import path from 'path';
import reindexManager from './reindex-manager';
import database from './database';

async function testReindexSystem() {
  console.log('=== Testing High-Performance Reindex System ===\n');

  try {
    // Initialize database
    console.log('1. Initializing database...');
    await database.initialize();
    console.log('✓ Database initialized\n');

    // Initialize reindex manager
    console.log('2. Initializing reindex manager...');
    await reindexManager.initialize();
    console.log('✓ Reindex manager initialized\n');

    // Example directories to index (adjust these paths as needed)
    const testDirectories = [
      'C:/Users/Public/Documents', // Example directory
      // Add your actual presentation directories here
    ];

    console.log('3. Starting reindex operation...');
    console.log(`   Directories: ${testDirectories.join(', ')}`);
    console.log('   Configuration:');
    console.log('   - Workers: 10 (configurable)');
    console.log('   - Batch size: 50 presentations');
    console.log('   - Flush interval: 5 seconds');
    console.log('   - Priority: Recent files first\n');

    // Set up event listeners for progress tracking
    reindexManager.on('started', (progress) => {
      console.log(`🚀 Reindex started: ${progress.totalFiles} files to process`);
    });

    reindexManager.on('progress', (progress) => {
      const percentage = ((progress.processedFiles / progress.totalFiles) * 100).toFixed(1);
      const eta = progress.estimatedTimeRemaining > 0 ? 
        `ETA: ${Math.round(progress.estimatedTimeRemaining)}s` : 'ETA: calculating...';
      
      console.log(`📊 Progress: ${progress.processedFiles}/${progress.totalFiles} (${percentage}%) | ` +
                 `Speed: ${progress.filesPerSecond.toFixed(1)} files/sec | ` +
                 `Workers: ${progress.workersActive} | ${eta}`);
    });

    reindexManager.on('batchFlushed', (info) => {
      console.log(`💾 Batch ${info.totalBatches} flushed: ${info.batchSize} items in ${info.flushTime}ms`);
    });

    reindexManager.on('completed', (result) => {
      console.log('\n🎉 Reindex completed!');
      console.log(`   Total time: ${(result.timeMs / 1000).toFixed(2)} seconds`);
      console.log(`   Files processed: ${result.successfulFiles}`);
      console.log(`   Files failed: ${result.failedFiles}`);
      console.log(`   Average speed: ${result.averageSpeed?.toFixed(1)} files/second`);
      console.log(`   Batches flushed: ${result.batchesFlushed}`);
    });

    reindexManager.on('error', (error) => {
      console.error('❌ Reindex error:', error);
    });

    // Start the reindex operation with custom options
    const reindexOptions = {
      maxWorkers: 10,           // Use 10 workers for maximum throughput
      batchSize: 50,            // Batch 50 presentations before flushing to database
      flushIntervalMs: 5000,    // Flush every 5 seconds
      prioritizeRecent: true    // Process recent files first
    };

    await reindexManager.startReindex(testDirectories, reindexOptions);

    // Wait for completion
    await new Promise<void>((resolve) => {
      reindexManager.once('completed', () => resolve());
      reindexManager.once('error', () => resolve());
    });

    console.log('\n4. Getting worker statistics...');
    const workerStats = reindexManager.getWorkerStats();
    workerStats.forEach((worker, index) => {
      console.log(`   Worker ${worker.workerId}: ${worker.processed} processed, ${worker.errors} errors, ${worker.busy ? 'busy' : 'idle'}`);
    });

    console.log('\n5. Testing database search after reindex...');
    const searchResults = await database.searchPresentations('test', { limit: 5 });
    console.log(`   Found ${searchResults.length} search results`);

    console.log('\n✅ Reindex system test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Clean up
    console.log('\n6. Cleaning up...');
    await reindexManager.terminate();
    await database.close();
    console.log('✓ Cleanup completed');
  }
}

// Example usage function for integration
export async function performReindex(directories: string[], options?: {
  maxWorkers?: number;
  batchSize?: number;
  onProgress?: (progress: any) => void;
  onCompleted?: (result: any) => void;
  onError?: (error: any) => void;
}): Promise<void> {
  console.log('Starting high-performance reindex...');

  // Initialize systems
  await database.initialize();
  await reindexManager.initialize();

  // Set up event listeners
  if (options?.onProgress) {
    reindexManager.on('progress', options.onProgress);
  }
  
  if (options?.onCompleted) {
    reindexManager.once('completed', options.onCompleted);
  }
  
  if (options?.onError) {
    reindexManager.once('error', options.onError);
  }

  // Configure reindex options
  const reindexOptions = {
    maxWorkers: options?.maxWorkers || 10,
    batchSize: options?.batchSize || 50,
    flushIntervalMs: 5000,
    prioritizeRecent: true
  };

  // Start reindex
  await reindexManager.startReindex(directories, reindexOptions);
}

// Run test if this file is executed directly
if (require.main === module) {
  testReindexSystem().catch(console.error);
}

export default testReindexSystem;
