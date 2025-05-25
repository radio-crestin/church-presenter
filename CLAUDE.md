# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Electron desktop application called "Church Presenter" - a presentation tool for church services. The project uses Electron Forge for building and packaging.

## Architecture

- **Main Process**: `src/index.js` - Entry point for the Electron main process, handles window creation and lifecycle
- **Renderer Process**: `src/index.html` - The web UI that users interact with
- **Preload Script**: `src/preload.js` - Bridge between main and renderer processes (currently minimal)
- **Styling**: `src/index.css` - Application styles

The app follows standard Electron architecture with separate main and renderer processes.

## Development Commands

- `npm run start` or `yarn start` - Start the application in development mode
- `npm run package` or `yarn package` - Package the application for current platform
- `npm run make` or `yarn make` - Build distributables for current platform
- `npm run publish` or `yarn publish` - Publish the application
- `npm run lint` or `yarn lint` - Currently returns "No linting configured"

## Build Configuration

The project uses Electron Forge with configuration in `forge.config.js`:
- Supports multiple platforms: Windows (Squirrel), macOS (ZIP), Linux (DEB/RPM)
- Uses ASAR packaging for bundling
- Includes security fuses for production builds
- Auto-unpacks native modules

## Package Management

Uses Yarn as the package manager (specified in package.json).

## Development Guidelines

### Code Organization
- Use ES modules (`import`/`export`) or CommonJS (`require`/`module.exports`) consistently
- Split application logic into separate modules for maintainability
- Use `camelCase` for variables and functions, `PascalCase` for classes
- Aim for line lengths between 80-100 characters

### Security Best Practices
- **Context Isolation**: Enable for renderer processes to prevent main process access
- **Node.js Integration**: Disable in renderer unless strictly necessary; use contextBridge for limited API exposure
- **Input Validation**: Sanitize all user input and IPC data
- **Remote Module**: Avoid using - use IPC instead for security
- Handle `new-window` events by validating URLs before opening

### Performance Considerations
- Move long-running tasks to main process or worker threads
- Enable hardware acceleration for better rendering
- Minimize DOM manipulations in renderer
- Use lazy loading for modules and images
- Implement code splitting to reduce initial load time

### Common Anti-patterns to Avoid
- Using global state excessively
- Tight coupling between components
- Long-running tasks in renderer process
- Using the deprecated remote module
- Not sanitizing IPC communication

### Testing
- Write unit tests for individual components
- Use integration tests for component interactions
- Implement end-to-end tests for full application flows
- Use Jest, Mocha, Cypress, or Puppeteer for testing frameworks

### Development Tools
- Use ESLint for code linting (currently not configured)
- Consider Prettier for code formatting
- Use Chrome DevTools for renderer debugging
- Use Electron DevTools for main process debugging