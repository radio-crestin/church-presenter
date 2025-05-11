import { useEffect, useState } from 'react';
import WindowService, { WindowSettings, DEFAULT_WINDOW_SETTINGS } from '../services/WindowService';

interface UseWindowManagerReturn {
  isSupported: boolean;
  presenterWindowId: number | null;
  windowSettings: WindowSettings;
  displays: Array<{ id: string; name: string; bounds: { x: number; y: number; width: number; height: number } }>;
  createPresenterWindow: (initialProps?: object) => Promise<number | null>;
  closePresenterWindow: () => Promise<void>;
  saveCurrentWindowSettings: () => Promise<void>;
  isLoading: boolean;
}

/**
 * Hook to manage window operations
 */
export function useWindowManager(): UseWindowManagerReturn {
  const [presenterWindowId, setPresenterWindowId] = useState<number | null>(null);
  const [windowSettings, setWindowSettings] = useState<WindowSettings>(DEFAULT_WINDOW_SETTINGS);
  const [displays, setDisplays] = useState<Array<{ id: string; name: string; bounds: { x: number; y: number; width: number; height: number } }>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const isSupported = WindowService.supportsMultipleWindows();

  // Load window settings and available displays on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const settings = await WindowService.loadWindowSettings();
        setWindowSettings(settings);

        if (isSupported) {
          const availableDisplays = await WindowService.getAvailableDisplays();
          setDisplays(availableDisplays);
        }
      } catch (error) {
        console.error('Failed to load window data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [isSupported]);

  // Create presenter window
  const createPresenterWindow = async (initialProps: object = {}): Promise<number | null> => {
    try {
      const windowId = await WindowService.createPresenterWindow(initialProps);
      if (windowId !== null) {
        setPresenterWindowId(windowId);
      }
      return windowId;
    } catch (error) {
      console.error('Failed to create presenter window:', error);
      return null;
    }
  };

  // Close presenter window
  const closePresenterWindow = async (): Promise<void> => {
    try {
      await WindowService.closePresenterWindow();
      setPresenterWindowId(null);
    } catch (error) {
      console.error('Failed to close presenter window:', error);
    }
  };

  // Save current window settings
  const saveCurrentWindowSettings = async (): Promise<void> => {
    try {
      await WindowService.saveCurrentWindowSettings();
      // Reload settings after saving
      const settings = await WindowService.loadWindowSettings();
      setWindowSettings(settings);
    } catch (error) {
      console.error('Failed to save window settings:', error);
    }
  };

  return {
    isSupported,
    presenterWindowId,
    windowSettings,
    displays,
    createPresenterWindow,
    closePresenterWindow,
    saveCurrentWindowSettings,
    isLoading,
  };
}
