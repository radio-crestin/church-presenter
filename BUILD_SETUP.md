# Build Setup Guide

This guide explains how to set up automated builds for Church Presenter with proper code signing for macOS.

## GitHub Secrets Setup

To enable automatic builds with code signing, you need to configure the following GitHub repository secrets:

### Required for macOS Code Signing (Optional but Recommended)

1. **MACOS_CERTIFICATE**: Base64-encoded .p12 certificate file
   - Export your Developer ID Application certificate from Keychain Access as a .p12 file
   - Convert to base64: `base64 -i certificate.p12 | pbcopy`
   - Paste the result into this secret

2. **MACOS_CERTIFICATE_PWD**: Password for the .p12 certificate file

3. **APPLE_ID**: Your Apple ID email (for notarization)

4. **APPLE_ID_PWD**: App-specific password for your Apple ID
   - Generate at: https://appleid.apple.com/account/manage > Sign-In and Security > App-Specific Passwords

5. **APPLE_TEAM_ID**: Your Apple Developer Team ID
   - Find at: https://developer.apple.com/account/#!/membership

### How to Add Secrets

1. Go to your GitHub repository
2. Click Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each secret with the exact names listed above

## Building Without Code Signing

If you don't set up the macOS certificates, the workflow will still build the app but:
- macOS users will see "app is damaged" warnings
- They'll need to right-click → Open or disable Gatekeeper temporarily
- For distribution, code signing is highly recommended

## Getting Apple Developer Certificates

1. Join the Apple Developer Program ($99/year)
2. Create a Developer ID Application certificate in Xcode or Apple Developer portal
3. Export it as a .p12 file from Keychain Access
4. Generate an app-specific password for notarization

## Testing the Build

1. Create a new release on GitHub (or push a new tag)
2. The workflow will automatically build for macOS, Linux, and Windows
3. Built artifacts will be attached to the release
4. For macOS, if properly signed, the app should open without warnings

## Troubleshooting

- **"Resource not accessible by integration"**: Check that the workflow has `contents: write` permission
- **"app is damaged"**: Code signing failed or wasn't configured
- **Build fails on macOS**: Check certificate setup and entitlements
- **Python dependencies fail**: Ensure requirements.txt exists in scripts/convert-to-pptx/

## Manual Building

For local development:
```bash
yarn build    # Compile TypeScript
yarn start    # Run in development mode
yarn package  # Package for current platform
yarn make     # Create distributables
