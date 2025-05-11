import { NativeModules, Platform } from 'react-native';

// Define the interface for window settings
export interface WindowSettings {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

// Default window settings
export const DEFAULT_WINDOW_SETTINGS: WindowSettings = {
  x: 100,
  y: 100,
  width: 800,
  height: 600,
  isMaximized: false,
};

// Define the interface for the native module
interface WindowManagerModule {
  createNewWindow: (componentName: string, initialProps: object) => Promise<number>;
  setWindowPosition: (windowId: number, x: number, y: number) => Promise<void>;
  setWindowSize: (windowId: number, width: number, height: number) => Promise<void>;
  maximizeWindow: (windowId: number) => Promise<void>;
  restoreWindow: (windowId: number) => Promise<void>;
  closeWindow: (windowId: number) => Promise<void>;
  getWindowPosition: (windowId: number) => Promise<{ x: number; y: number }>;
  getWindowSize: (windowId: number) => Promise<{ width: number; height: number }>;
  isWindowMaximized: (windowId: number) => Promise<boolean>;
  getAvailableDisplays: () => Promise<Array<{ id: string; name: string; bounds: { x: number; y: number; width: number; height: number } }>>;
}

// Access the native module (will be implemented in native code)
const WindowManager: WindowManagerModule | null = Platform.OS === 'windows' 
  ? NativeModules.WindowManager as WindowManagerModule 
  : null;

// Storage keys
const PRESENTER_WINDOW_SETTINGS_KEY = 'presenter_window_settings';

/**
 * Service to manage window operations
 */
class WindowService {
  private static instance: WindowService;
  private presenterWindowId: number | null = null;

  private constructor() {}

  public static getInstance(): WindowService {
    if (!WindowService.instance) {
      WindowService.instance = new WindowService();
    }
    return WindowService.instance;
  }

  /**
   * Check if the platform supports multiple windows
   */
  public supportsMultipleWindows(): boolean {
    return Platform.OS === 'windows' && WindowManager !== null;
  }

  /**
   * Create a new presenter window
   */
  public async createPresenterWindow(initialProps: object = {}): Promise<number | null> {
    if (!this.supportsMultipleWindows()) {
      console.warn('Multiple windows are not supported on this platform');
      return null;
    }

    try {
      // Load saved settings
      const settings = await this.loadWindowSettings();
      
      // Create the window
      const windowId = await WindowManager!.createNewWindow('PresenterView', {
        ...initialProps,
        windowSettings: settings,
      });
      
      this.presenterWindowId = windowId;
      
      // Apply saved settings
      await this.applyWindowSettings(windowId, settings);
      
      return windowId;
    } catch (error) {
      console.error('Failed to create presenter window:', error);
      return null;
    }
  }

  /**
   * Apply window settings to a window
   */
  private async applyWindowSettings(windowId: number, settings: WindowSettings): Promise<void> {
    if (!this.supportsMultipleWindows() || windowId === null) {
      return;
    }

    try {
      await WindowManager!.setWindowPosition(windowId, settings.x, settings.y);
      await WindowManager!.setWindowSize(windowId, settings.width, settings.height);
      
      if (settings.isMaximized) {
        await WindowManager!.maximizeWindow(windowId);
      }
    } catch (error) {
      console.error('Failed to apply window settings:', error);
    }
  }

  /**
   * Save current window settings
   */
  public async saveCurrentWindowSettings(): Promise<void> {
    if (!this.supportsMultipleWindows() || this.presenterWindowId === null) {
      return;
    }

    try {
      const position = await WindowManager!.getWindowPosition(this.presenterWindowId);
      const size = await WindowManager!.getWindowSize(this.presenterWindowId);
      const isMaximized = await WindowManager!.isWindowMaximized(this.presenterWindowId);

      const settings: WindowSettings = {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        isMaximized,
      };

      await this.saveWindowSettings(settings);
    } catch (error) {
      console.error('Failed to save window settings:', error);
    }
  }

  /**
   * Load saved window settings
   */
  public async loadWindowSettings(): Promise<WindowSettings> {
    if (!this.supportsMultipleWindows()) {
      return DEFAULT_WINDOW_SETTINGS;
    }

    try {
      // In a real implementation, this would use AsyncStorage or another storage mechanism
      // For now, we'll just return the default settings
      // This would be implemented with a native module to access Windows registry or settings file
      return DEFAULT_WINDOW_SETTINGS;
    } catch (error) {
      console.error('Failed to load window settings:', error);
      return DEFAULT_WINDOW_SETTINGS;
    }
  }

  /**
   * Save window settings
   */
  private async saveWindowSettings(settings: WindowSettings): Promise<void> {
    // In a real implementation, this would use AsyncStorage or another storage mechanism
    // This would be implemented with a native module to access Windows registry or settings file
    console.log('Saving window settings:', settings);
  }

  /**
   * Close the presenter window
   */
  public async closePresenterWindow(): Promise<void> {
    if (!this.supportsMultipleWindows() || this.presenterWindowId === null) {
      return;
    }

    try {
      // Save settings before closing
      await this.saveCurrentWindowSettings();
      
      // Close the window
      await WindowManager!.closeWindow(this.presenterWindowId);
      this.presenterWindowId = null;
    } catch (error) {
      console.error('Failed to close presenter window:', error);
    }
  }

  /**
   * Get available displays
   */
  public async getAvailableDisplays(): Promise<Array<{ id: string; name: string; bounds: { x: number; y: number; width: number; height: number } }>> {
    if (!this.supportsMultipleWindows()) {
      return [];
    }

    try {
      return await WindowManager!.getAvailableDisplays();
    } catch (error) {
      console.error('Failed to get available displays:', error);
      return [];
    }
  }
}

export default WindowService.getInstance();
