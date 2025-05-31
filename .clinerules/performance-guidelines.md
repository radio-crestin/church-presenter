# Performance Guidelines

## Main Process Optimization
- Move long-running tasks to main process or worker threads
- Avoid blocking the main thread with synchronous operations
- Use asynchronous APIs whenever possible
- Implement proper error handling for async operations

## Renderer Process Optimization
- Minimize DOM manipulations in renderer process
- Use requestAnimationFrame for smooth animations
- Implement virtual scrolling for large lists
- Debounce user input events (search, resize, etc.)
- Use CSS transforms instead of changing layout properties

## Memory Management
- Properly dispose of event listeners when components unmount
- Clean up timers and intervals
- Avoid memory leaks in IPC communication
- Use WeakMap/WeakSet for temporary object references
- Monitor memory usage during development

## Asset Optimization
- Enable hardware acceleration for better rendering
- Use lazy loading for modules and images
- Implement code splitting to reduce initial load time
- Optimize images and assets before bundling
- Use efficient data structures for large datasets

## Database Performance
- Use indexed queries for SQLite operations
- Implement connection pooling if needed
- Use transactions for bulk operations
- Regular database maintenance and optimization
- Consider caching frequently accessed data

## Worker Thread Optimization
- Use worker pool for CPU-intensive tasks
- Minimize data transfer between main and worker threads
- Use structured cloning for data transfer
- Implement proper error handling in workers
- Balance workload across available worker threads

## Search Performance
- Implement search result pagination
- Use FlexSearch optimization settings
- Cache search results when appropriate
- Debounce search input to reduce query frequency
- Index optimization for search performance

## File System Operations
- Use streams for large file operations
- Implement file watching efficiently with Chokidar
- Batch file system operations when possible
- Use proper file locking mechanisms
- Handle file system errors gracefully
