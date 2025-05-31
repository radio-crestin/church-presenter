# Cline Rules for Church Presenter

This directory contains specific guidelines and rules for Cline (AI assistant) when working with the Church Presenter Electron application.

## Overview

Church Presenter is an Electron desktop application built with TypeScript for managing church presentation services. These rules help Cline understand the project structure, development practices, and best practices specific to this codebase.

## Rule Files

### [project-overview.md](./project-overview.md)
- Application architecture and technology stack
- Key features and components
- File structure and build process
- Dependencies and tools used

### [development-guidelines.md](./development-guidelines.md)
- Development commands and workflow
- Code organization standards
- TypeScript configuration
- Testing and debugging approaches
- File structure conventions

### [security-guidelines.md](./security-guidelines.md)
- Electron security best practices
- Context isolation and IPC security
- Input validation requirements
- File system access controls
- Security checklist for implementation

### [performance-guidelines.md](./performance-guidelines.md)
- Main and renderer process optimization
- Memory management practices
- Database performance considerations
- Worker thread optimization
- Asset and file system operations

## Key Points for Cline

1. **Use TypeScript**: All code should be written in TypeScript following ES2020 standards
2. **Build Process**: Use `yarn build` to compile TypeScript and copy assets
3. **Security First**: Always follow Electron security best practices
4. **Performance Aware**: Consider performance implications of renderer vs main process operations
5. **Code Quality**: Maintain clean, modular code with proper error handling

## Getting Started

When working on this project, Cline should:
1. Review the project overview to understand the application architecture
2. Follow development guidelines for code standards and structure
3. Implement security best practices for all Electron-specific features
4. Consider performance implications outlined in the performance guidelines
5. Use the specified development commands for building and testing

## Dependencies to Remember

- **Electron 36.3.1** - Desktop app framework
- **TypeScript** - Primary language (ES2020 target)
- **SQLite3** - Database for data persistence
- **FlexSearch** - Search functionality
- **Chokidar** - File system watching
- **OfficeParser** - Document parsing capabilities
