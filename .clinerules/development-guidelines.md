# Development Guidelines

## Development Commands
- `yarn build` - Compile TypeScript and copy assets to dist/
- `yarn start` - Build and start application in development mode
- `yarn package` - Package application for current platform
- `yarn make` - Build distributables for current platform
- `yarn publish` - Publish the application
- `yarn lint` - Currently returns "No linting configured"

## Code Organization
- Use TypeScript consistently throughout the project
- Follow ES2020 syntax with CommonJS modules
- Split application logic into separate modules for maintainability
- Use `camelCase` for variables and functions, `PascalCase` for classes
- Aim for line lengths between 80-100 characters
- Place all source code in `src/` directory
- Compiled output goes to `dist/` directory

## File Structure
```
src/
├── index.ts           # Main Electron process entry point
├── index.html         # Renderer UI
├── index.css          # Application styles
├── preload.ts         # Secure IPC bridge
├── renderer.ts        # Renderer process logic
├── database.ts        # SQLite database operations
├── sync-manager.ts    # File synchronization
├── search-manager.ts  # FlexSearch implementation
├── presentation-parser.ts    # Document parsing
├── presentation-worker.ts    # Worker thread for presentations
├── worker-pool.ts     # Thread pool management
└── types/
    └── index.ts       # TypeScript type definitions
```

## TypeScript Configuration
- Target: ES2020
- Module: CommonJS
- Strict mode enabled
- Source maps and declarations generated
- Include DOM and Node.js types
- Use proper type definitions for all dependencies

## Testing Guidelines
- Write unit tests for individual components
- Use integration tests for component interactions
- Implement end-to-end tests for full application flows
- Consider Jest, Mocha, Cypress, or Puppeteer for testing frameworks
- Test both main and renderer processes separately

## Development Tools
- Use ESLint for code linting (currently not configured - consider adding)
- Consider Prettier for code formatting
- Use Chrome DevTools for renderer debugging
- Use Electron DevTools for main process debugging
- Leverage TypeScript compiler for type checking
