# Church Presenter - Project Overview

## Application Type
Electron desktop application for church presentation services

## Technology Stack
- **Runtime**: Electron 36.3.1
- **Language**: TypeScript (target: ES2020, module: commonjs)
- **Package Manager**: Yarn (specified in package.json)
- **Build Tool**: Electron Forge
- **Database**: SQLite3
- **Search**: FlexSearch
- **File Watching**: Chokidar
- **Document Parsing**: OfficeParser

## Architecture
- **Main Process**: `src/index.ts` - Entry point, window management, lifecycle
- **Renderer Process**: `src/index.html` - Web UI interface
- **Preload Script**: `src/preload.ts` - Secure bridge between processes
- **Worker Processes**: `src/presentation-worker.ts`, `src/worker-pool.ts`
- **Core Services**: Database, sync, search, presentation parsing

## Key Features
- Presentation management and parsing
- Real-time file synchronization
- Search functionality across presentations
- Multi-threaded processing with worker pool
- Document format conversion (via Python scripts)

## Build Output
- Source: `src/` (TypeScript)
- Compiled: `dist/` (JavaScript + assets)
- Distribution: Created by Electron Forge
