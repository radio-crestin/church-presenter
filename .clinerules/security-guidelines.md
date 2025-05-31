# Security Guidelines

## Electron Security Best Practices

### Context Isolation
- **ALWAYS** enable context isolation for renderer processes
- Prevents renderer from accessing main process APIs directly
- Use `contextBridge` in preload scripts for secure communication

### Node.js Integration
- **DISABLE** Node.js integration in renderer processes unless absolutely necessary
- Use IPC (Inter-Process Communication) instead of direct Node.js access
- If Node.js integration is required, limit it to specific use cases

### Input Validation
- **SANITIZE** all user input before processing
- Validate all IPC message data in both main and renderer processes
- Never trust data coming from renderer processes
- Use type checking and schema validation for IPC payloads

### Remote Module
- **AVOID** using the deprecated `remote` module
- Use IPC communication patterns instead
- Implement proper API boundaries between processes

### Window Security
- Handle `new-window` events by validating URLs before opening
- Prevent navigation to untrusted external sites
- Use `allowRunningInsecureContent: false` in webPreferences
- Set appropriate CSP (Content Security Policy) headers

### File System Access
- Limit file system access to necessary directories only
- Validate file paths to prevent directory traversal attacks
- Use sandboxed processes when possible

### IPC Security
- Implement proper message validation on both ends
- Use structured data formats (JSON schemas) for IPC messages
- Log and monitor IPC communication for debugging
- Implement rate limiting for IPC messages if needed

## Security Checklist
- [ ] Context isolation enabled
- [ ] Node.js integration disabled in renderer
- [ ] Input validation implemented
- [ ] IPC messages validated
- [ ] No use of deprecated remote module
- [ ] Window navigation restricted
- [ ] File access limited and validated
