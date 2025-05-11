# React Native Windows Development Guide with NativeWind

## Project Setup

```bash
# Create a new React Native project with TypeScript
npx react-native init AppName --template react-native-template-typescript

# Add Windows support
npx react-native-windows-init --overwrite

# Install NativeWind
npm install nativewind
npm install --save-dev tailwindcss@3.3.2

# Initialize Tailwind CSS
npx tailwindcss init

# Run the Windows app
npx react-native run-windows
```

## NativeWind Configuration

### tailwind.config.js
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      // Windows Fluent UI colors
      colors: {
        'windows-blue': '#0078D4',
        'windows-light': '#F3F2F1',
        'windows-dark': '#323130',
        'windows-accent': '#0078D4',
      },
      // Windows-specific spacing
      spacing: {
        'win-sm': '4px',
        'win-md': '8px',
        'win-lg': '12px',
        'win-xl': '16px',
        'win-2xl': '20px',
        'win-3xl': '24px',
      },
    },
  },
  plugins: [],
}
```

### babel.config.js
```javascript
module.exports = {
  presets: ['module:metro-react-native-babel-preset'],
  plugins: ['nativewind/babel'],
};
```

### Add TypeScript definitions (nativewind-env.d.ts)
```typescript
/// <reference types="nativewind/types" />
```

## Directory Structure

```
src/
├── assets/            # Static assets
├── components/        # Reusable UI components
│   ├── common/        # Generic components
│   └── specific/      # App-specific components
├── screens/           # Screen components
├── navigation/        # Navigation configuration
├── services/          # API and other services
├── store/             # State management
├── hooks/             # Custom React hooks
└── utils/             # Utility functions
```

## Windows-Specific NativeWind Components

### Windows Button Component

```typescript
// WindowsButton.tsx
import React from 'react';
import { Text, Pressable, Platform } from 'react-native';
import { styled } from 'nativewind';

const StyledPressable = styled(Pressable);
const StyledText = styled(Text);

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'accent';
  disabled?: boolean;
};

export const WindowsButton: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
}) => {
  // Windows-specific styling
  const isWindows = Platform.OS === 'windows';
  
  const getButtonClasses = () => {
    const baseClasses = 'py-win-lg px-win-xl rounded-sm';
    
    if (disabled) return `${baseClasses} opacity-50 bg-gray-300`;
    
    switch (variant) {
      case 'primary':
        return `${baseClasses} bg-windows-blue active:bg-blue-700`;
      case 'secondary':
        return `${baseClasses} bg-windows-light border border-gray-300 active:bg-gray-200`;
      case 'accent':
        return `${baseClasses} bg-windows-accent active:bg-blue-700`;
      default:
        return `${baseClasses} bg-windows-blue active:bg-blue-700`;
    }
  };
  
  const getTextClasses = () => {
    if (variant === 'secondary') {
      return 'text-windows-dark font-medium';
    }
    return 'text-white font-medium';
  };

  return (
    <StyledPressable
      className={getButtonClasses()}
      onPress={onPress}
      disabled={disabled}
      style={isWindows ? { minWidth: 120, minHeight: 32 } : {}}
    >
      <StyledText className={getTextClasses()}>
        {title}
      </StyledText>
    </StyledPressable>
  );
};

export default WindowsButton;
```

### Windows Card Component

```typescript
// WindowsCard.tsx
import React from 'react';
import { View } from 'react-native';
import { styled } from 'nativewind';

const StyledView = styled(View);

type CardProps = {
  children: React.ReactNode;
  elevated?: boolean;
};

export const WindowsCard: React.FC<CardProps> = ({
  children,
  elevated = false,
}) => {
  return (
    <StyledView
      className={`bg-white p-win-xl rounded-sm border border-gray-200 ${
        elevated ? 'shadow-md' : ''
      }`}
    >
      {children}
    </StyledView>
  );
};

export default WindowsCard;
```

## Platform Detection and Conditional Styling

```typescript
// Platform detection
import { Platform } from 'react-native';
import { styled } from 'nativewind';

const StyledView = styled(View);

// Windows-specific component
export const Container = ({ children }) => {
  const isWindows = Platform.OS === 'windows';
  
  return (
    <StyledView 
      className={`p-4 ${isWindows ? 'bg-windows-light' : 'bg-white'}`}
      // Add Windows-specific native styles that can't be handled by Tailwind
      style={isWindows ? { 
        minWidth: 320,
        // Windows-specific shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1,
      } : {}}
    >
      {children}
    </StyledView>
  );
};
```

## Windows Fluent Design with NativeWind

### Acrylic Effect (Translucent Background)

```typescript
// AcrylicBackground.tsx
import React from 'react';
import { View, Platform } from 'react-native';
import { styled } from 'nativewind';

const StyledView = styled(View);

export const AcrylicBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isWindows = Platform.OS === 'windows';
  
  return (
    <StyledView
      className="bg-white/80 backdrop-blur-md"
      style={isWindows ? {
        // Windows-specific acrylic effect properties
        backdropFilter: 'blur(10px)',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
      } : {}}
    >
      {children}
    </StyledView>
  );
};
```

## Performance Tips

1. Use `React.memo` for pure components
2. Implement virtualized lists for large datasets
3. Optimize NativeWind by using className compilation
4. Use debounce/throttle for event handlers
5. Minimize bridge communication between JS and native code

## Windows UI Guidelines with NativeWind

1. Use Windows Fluent Design colors and spacing in your tailwind.config.js
2. Create Windows-specific component variants (.windows.tsx files)
3. Support keyboard, mouse, touch, and pen input
4. Implement responsive layouts using NativeWind breakpoints
5. Use Windows-native controls for complex interactions
6. Support Windows accessibility features
7. Optimize for different DPI settings

## Example App.tsx with NativeWind

```typescript
import React from 'react';
import { SafeAreaView, ScrollView, Text, View } from 'react-native';
import { styled } from 'nativewind';
import WindowsButton from './src/components/WindowsButton';
import WindowsCard from './src/components/WindowsCard';

// Style your components with NativeWind
const StyledSafeAreaView = styled(SafeAreaView);
const StyledScrollView = styled(ScrollView);
const StyledView = styled(View);
const StyledText = styled(Text);

function App(): JSX.Element {
  return (
    <StyledSafeAreaView className="flex-1 bg-windows-light">
      <StyledScrollView className="flex-1 p-win-xl">
        <StyledView className="mb-win-3xl">
          <StyledText className="text-2xl font-bold text-windows-dark mb-win-lg">
            Windows Fluent UI Demo
          </StyledText>
          
          <WindowsCard elevated>
            <StyledText className="text-lg text-windows-dark mb-win-md">
              Welcome to React Native Windows with NativeWind
            </StyledText>
            <StyledText className="text-gray-600 mb-win-xl">
              This example demonstrates how to create Windows-native looking UI with Tailwind CSS
            </StyledText>
            <StyledView className="flex-row space-x-win-md">
              <WindowsButton title="Primary" onPress={() => {}} />
              <WindowsButton title="Secondary" variant="secondary" onPress={() => {}} />
              <WindowsButton title="Accent" variant="accent" onPress={() => {}} />
            </StyledView>
          </WindowsCard>
        </StyledView>
      </StyledScrollView>
    </StyledSafeAreaView>
  );
}

export default App;
```

## Testing Strategy

1. Unit tests with Jest and React Testing Library
2. Integration tests for component interactions
3. End-to-end tests with Detox
4. Visual regression tests for Windows-specific UI

## Deployment

1. Configure `Package.appxmanifest` with production values
2. Build release version with Visual Studio or MSBuild
3. Create app package for Microsoft Store or sideloading
4. Sign the package with a certificate
5. Distribute through Microsoft Store or direct distribution
