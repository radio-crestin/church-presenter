#pragma once

#include "NativeModules.h"
#include "winrt/Windows.Foundation.h"
#include "winrt/Windows.Foundation.Collections.h"
#include "winrt/Windows.UI.ViewManagement.h"
#include "winrt/Windows.ApplicationModel.Core.h"
#include "winrt/Windows.UI.Core.h"
#include "winrt/Windows.UI.Xaml.h"
#include "winrt/Windows.UI.Xaml.Controls.h"
#include "winrt/Windows.UI.Xaml.Hosting.h"
#include "winrt/Windows.UI.Xaml.Media.h"
#include "winrt/Windows.Storage.h"
#include "winrt/Windows.Storage.Streams.h"
#include "winrt/Windows.Graphics.Display.h"

namespace winrt {
    using namespace Windows::Foundation;
    using namespace Windows::Foundation::Collections;
    using namespace Windows::UI::ViewManagement;
    using namespace Windows::ApplicationModel::Core;
    using namespace Windows::UI::Core;
    using namespace Windows::UI::Xaml;
    using namespace Windows::UI::Xaml::Controls;
    using namespace Windows::UI::Xaml::Hosting;
    using namespace Windows::UI::Xaml::Media;
    using namespace Windows::Storage;
    using namespace Windows::Storage::Streams;
    using namespace Windows::Graphics::Display;
}

namespace WindowManagerModule {

    REACT_MODULE(WindowManager);
    class WindowManager {
    public:
        WindowManager();
        ~WindowManager();

        // Map to store window IDs and their corresponding view IDs
        std::map<int, int> m_windowMap;
        int m_nextWindowId = 1;

        // Settings file name
        const std::wstring SETTINGS_FILE_NAME = L"presenter_window_settings.json";

        // Create a new window
        REACT_METHOD(CreateNewWindow);
        winrt::fire_and_forget CreateNewWindow(std::string componentName, React::JSValueObject initialProps, React::ReactPromise<int> promise) noexcept;

        // Set window position
        REACT_METHOD(SetWindowPosition);
        winrt::fire_and_forget SetWindowPosition(int windowId, int x, int y, React::ReactPromise<void> promise) noexcept;

        // Set window size
        REACT_METHOD(SetWindowSize);
        winrt::fire_and_forget SetWindowSize(int windowId, int width, int height, React::ReactPromise<void> promise) noexcept;

        // Maximize window
        REACT_METHOD(MaximizeWindow);
        winrt::fire_and_forget MaximizeWindow(int windowId, React::ReactPromise<void> promise) noexcept;

        // Restore window
        REACT_METHOD(RestoreWindow);
        winrt::fire_and_forget RestoreWindow(int windowId, React::ReactPromise<void> promise) noexcept;

        // Close window
        REACT_METHOD(CloseWindow);
        winrt::fire_and_forget CloseWindow(int windowId, React::ReactPromise<void> promise) noexcept;

        // Get window position
        REACT_METHOD(GetWindowPosition);
        winrt::fire_and_forget GetWindowPosition(int windowId, React::ReactPromise<React::JSValueObject> promise) noexcept;

        // Get window size
        REACT_METHOD(GetWindowSize);
        winrt::fire_and_forget GetWindowSize(int windowId, React::ReactPromise<React::JSValueObject> promise) noexcept;

        // Check if window is maximized
        REACT_METHOD(IsWindowMaximized);
        winrt::fire_and_forget IsWindowMaximized(int windowId, React::ReactPromise<bool> promise) noexcept;

        // Get available displays
        REACT_METHOD(GetAvailableDisplays);
        winrt::fire_and_forget GetAvailableDisplays(React::ReactPromise<React::JSValueArray> promise) noexcept;

    private:
        // Helper methods
        winrt::ApplicationViewBounds GetViewBounds(int viewId);
        winrt::ApplicationView GetApplicationViewForWindowId(int windowId);
        winrt::IAsyncOperation<winrt::StorageFile> GetSettingsFile();
        winrt::IAsyncOperation<winrt::StorageFile> CreateSettingsFile();
        winrt::IAsyncOperation<std::wstring> ReadSettingsFile();
        winrt::IAsyncAction WriteSettingsFile(std::wstring content);
    };
}
