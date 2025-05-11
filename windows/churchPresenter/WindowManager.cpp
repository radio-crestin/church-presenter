#include "pch.h"
#include "WindowManager.h"
#include "JSValueReader.h"
#include "JSValueWriter.h"

#include <winrt/Windows.UI.ViewManagement.h>
#include <winrt/Windows.ApplicationModel.Core.h>
#include <winrt/Windows.UI.Core.h>
#include <winrt/Windows.UI.Xaml.h>
#include <winrt/Windows.UI.Xaml.Controls.h>
#include <winrt/Windows.UI.Xaml.Hosting.h>
#include <winrt/Windows.UI.Xaml.Media.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Storage.Streams.h>
#include <winrt/Windows.Graphics.Display.h>

#include <string>
#include <map>
#include <vector>
#include <future>

namespace WindowManagerModule {

    WindowManager::WindowManager() {}

    WindowManager::~WindowManager() {}

    // Create a new window
    winrt::fire_and_forget WindowManager::CreateNewWindow(std::string componentName, React::JSValueObject initialProps, React::ReactPromise<int> promise) noexcept {
        try {
            // Get the current view
            auto currentView = winrt::ApplicationView::GetForCurrentView();
            auto dispatcher = winrt::CoreWindow::GetForCurrentThread().Dispatcher();

            // Create a new view
            auto newViewId = co_await winrt::CoreApplication::CreateNewView().Dispatcher().RunAsync(
                winrt::CoreDispatcherPriority::Normal,
                [componentName, initialProps]() -> int {
                    // Create a Frame and set it as the content of the window
                    auto frame = winrt::Frame();
                    winrt::Window::Current().Content(frame);
                    winrt::Window::Current().Activate();

                    // Set the window title
                    winrt::ApplicationView::GetForCurrentView().Title(L"Presenter View");

                    // Create a ReactRootView
                    auto reactRootView = winrt::Microsoft::ReactNative::ReactRootView();
                    reactRootView.ComponentName(winrt::to_hstring(componentName));
                    
                    // Convert initialProps to PropertyValue
                    auto propertyMap = winrt::PropertySet();
                    for (const auto& prop : initialProps) {
                        if (prop.second.Type() == React::JSValueType::String) {
                            propertyMap.Insert(winrt::to_hstring(prop.first), winrt::PropertyValue::CreateString(winrt::to_hstring(React::JSValueAsString(prop.second))));
                        } else if (prop.second.Type() == React::JSValueType::Int64) {
                            propertyMap.Insert(winrt::to_hstring(prop.first), winrt::PropertyValue::CreateInt64(React::JSValueAsInt64(prop.second)));
                        } else if (prop.second.Type() == React::JSValueType::Double) {
                            propertyMap.Insert(winrt::to_hstring(prop.first), winrt::PropertyValue::CreateDouble(React::JSValueAsDouble(prop.second)));
                        } else if (prop.second.Type() == React::JSValueType::Boolean) {
                            propertyMap.Insert(winrt::to_hstring(prop.first), winrt::PropertyValue::CreateBoolean(React::JSValueAsBoolean(prop.second)));
                        } else if (prop.second.Type() == React::JSValueType::Object) {
                            // For objects like windowSettings, convert to a string and then parse in JS
                            auto objStr = React::JSValueAsString(prop.second);
                            propertyMap.Insert(winrt::to_hstring(prop.first), winrt::PropertyValue::CreateString(winrt::to_hstring(objStr)));
                        }
                    }
                    
                    reactRootView.InitialProps(propertyMap);

                    // Set the ReactRootView as the content of the frame
                    frame.Content(reactRootView);

                    // Return the view ID
                    return winrt::ApplicationView::GetForCurrentView().Id();
                }
            );

            // Store the window ID and view ID
            int windowId = m_nextWindowId++;
            m_windowMap[windowId] = newViewId;

            // Show the new view
            bool viewShown = co_await winrt::ApplicationViewSwitcher::TryShowAsStandaloneAsync(
                newViewId,
                winrt::ViewSizePreference::UseHalf,
                currentView.Id(),
                winrt::ViewSizePreference::UseHalf
            );

            if (viewShown) {
                promise.Resolve(windowId);
            } else {
                promise.Reject("Failed to show the new view");
            }
        } catch (const std::exception& e) {
            promise.Reject(e.what());
        }
    }

    // Set window position
    winrt::fire_and_forget WindowManager::SetWindowPosition(int windowId, int x, int y, React::ReactPromise<void> promise) noexcept {
        try {
            if (m_windowMap.find(windowId) == m_windowMap.end()) {
                promise.Reject("Window ID not found");
                co_return;
            }

            auto view = GetApplicationViewForWindowId(windowId);
            if (!view) {
                promise.Reject("View not found");
                co_return;
            }

            // Get the window
            auto window = view.CoreWindow();
            
            // Set the position
            auto dispatcher = window.Dispatcher();
            co_await dispatcher.RunAsync(
                winrt::CoreDispatcherPriority::Normal,
                [window, x, y]() {
                    // Get the current bounds
                    auto bounds = window.Bounds();
                    
                    // Create new bounds with the same size but new position
                    winrt::Rect newBounds(x, y, bounds.Width, bounds.Height);
                    
                    // Try to set the new bounds
                    // Note: This is not fully supported in UWP, but we'll try
                    window.Bounds(newBounds);
                }
            );

            promise.Resolve();
        } catch (const std::exception& e) {
            promise.Reject(e.what());
        }
    }

    // Set window size
    winrt::fire_and_forget WindowManager::SetWindowSize(int windowId, int width, int height, React::ReactPromise<void> promise) noexcept {
        try {
            if (m_windowMap.find(windowId) == m_windowMap.end()) {
                promise.Reject("Window ID not found");
                co_return;
            }

            auto view = GetApplicationViewForWindowId(windowId);
            if (!view) {
                promise.Reject("View not found");
                co_return;
            }

            // Get the window
            auto window = view.CoreWindow();
            
            // Set the size
            auto dispatcher = window.Dispatcher();
            co_await dispatcher.RunAsync(
                winrt::CoreDispatcherPriority::Normal,
                [view, width, height]() {
                    // Try to resize the view
                    view.TryResizeView(winrt::Size(width, height));
                }
            );

            promise.Resolve();
        } catch (const std::exception& e) {
            promise.Reject(e.what());
        }
    }

    // Maximize window
    winrt::fire_and_forget WindowManager::MaximizeWindow(int windowId, React::ReactPromise<void> promise) noexcept {
        try {
            if (m_windowMap.find(windowId) == m_windowMap.end()) {
                promise.Reject("Window ID not found");
                co_return;
            }

            auto view = GetApplicationViewForWindowId(windowId);
            if (!view) {
                promise.Reject("View not found");
                co_return;
            }

            // Get the window
            auto window = view.CoreWindow();
            
            // Maximize the window
            auto dispatcher = window.Dispatcher();
            co_await dispatcher.RunAsync(
                winrt::CoreDispatcherPriority::Normal,
                [view]() {
                    // Try to maximize the view
                    view.TryEnterFullScreenMode();
                }
            );

            promise.Resolve();
        } catch (const std::exception& e) {
            promise.Reject(e.what());
        }
    }

    // Restore window
    winrt::fire_and_forget WindowManager::RestoreWindow(int windowId, React::ReactPromise<void> promise) noexcept {
        try {
            if (m_windowMap.find(windowId) == m_windowMap.end()) {
                promise.Reject("Window ID not found");
                co_return;
            }

            auto view = GetApplicationViewForWindowId(windowId);
            if (!view) {
                promise.Reject("View not found");
                co_return;
            }

            // Get the window
            auto window = view.CoreWindow();
            
            // Restore the window
            auto dispatcher = window.Dispatcher();
            co_await dispatcher.RunAsync(
                winrt::CoreDispatcherPriority::Normal,
                [view]() {
                    // Try to restore the view
                    view.ExitFullScreenMode();
                }
            );

            promise.Resolve();
        } catch (const std::exception& e) {
            promise.Reject(e.what());
        }
    }

    // Close window
    winrt::fire_and_forget WindowManager::CloseWindow(int windowId, React::ReactPromise<void> promise) noexcept {
        try {
            if (m_windowMap.find(windowId) == m_windowMap.end()) {
                promise.Reject("Window ID not found");
                co_return;
            }

            int viewId = m_windowMap[windowId];
            
            // Close the window
            co_await winrt::CoreApplication::Views().GetAt(viewId).Dispatcher().RunAsync(
                winrt::CoreDispatcherPriority::Normal,
                []() {
                    winrt::Window::Current().Close();
                }
            );

            // Remove the window from the map
            m_windowMap.erase(windowId);

            promise.Resolve();
        } catch (const std::exception& e) {
            promise.Reject(e.what());
        }
    }

    // Get window position
    winrt::fire_and_forget WindowManager::GetWindowPosition(int windowId, React::ReactPromise<React::JSValueObject> promise) noexcept {
        try {
            if (m_windowMap.find(windowId) == m_windowMap.end()) {
                promise.Reject("Window ID not found");
                co_return;
            }

            auto view = GetApplicationViewForWindowId(windowId);
            if (!view) {
                promise.Reject("View not found");
                co_return;
            }

            // Get the window
            auto window = view.CoreWindow();
            
            // Get the position
            auto dispatcher = window.Dispatcher();
            auto bounds = co_await dispatcher.RunAsync(
                winrt::CoreDispatcherPriority::Normal,
                [window]() -> winrt::Rect {
                    return window.Bounds();
                }
            );

            // Create the result object
            React::JSValueObject result;
            result["x"] = static_cast<int>(bounds.X);
            result["y"] = static_cast<int>(bounds.Y);

            promise.Resolve(result);
        } catch (const std::exception& e) {
            promise.Reject(e.what());
        }
    }

    // Get window size
    winrt::fire_and_forget WindowManager::GetWindowSize(int windowId, React::ReactPromise<React::JSValueObject> promise) noexcept {
        try {
            if (m_windowMap.find(windowId) == m_windowMap.end()) {
                promise.Reject("Window ID not found");
                co_return;
            }

            auto view = GetApplicationViewForWindowId(windowId);
            if (!view) {
                promise.Reject("View not found");
                co_return;
            }

            // Get the window
            auto window = view.CoreWindow();
            
            // Get the size
            auto dispatcher = window.Dispatcher();
            auto bounds = co_await dispatcher.RunAsync(
                winrt::CoreDispatcherPriority::Normal,
                [window]() -> winrt::Rect {
                    return window.Bounds();
                }
            );

            // Create the result object
            React::JSValueObject result;
            result["width"] = static_cast<int>(bounds.Width);
            result["height"] = static_cast<int>(bounds.Height);

            promise.Resolve(result);
        } catch (const std::exception& e) {
            promise.Reject(e.what());
        }
    }

    // Check if window is maximized
    winrt::fire_and_forget WindowManager::IsWindowMaximized(int windowId, React::ReactPromise<bool> promise) noexcept {
        try {
            if (m_windowMap.find(windowId) == m_windowMap.end()) {
                promise.Reject("Window ID not found");
                co_return;
            }

            auto view = GetApplicationViewForWindowId(windowId);
            if (!view) {
                promise.Reject("View not found");
                co_return;
            }

            // Check if the window is maximized
            auto dispatcher = view.CoreWindow().Dispatcher();
            bool isFullScreen = co_await dispatcher.RunAsync(
                winrt::CoreDispatcherPriority::Normal,
                [view]() -> bool {
                    return view.IsFullScreenMode();
                }
            );

            promise.Resolve(isFullScreen);
        } catch (const std::exception& e) {
            promise.Reject(e.what());
        }
    }

    // Get available displays
    winrt::fire_and_forget WindowManager::GetAvailableDisplays(React::ReactPromise<React::JSValueArray> promise) noexcept {
        try {
            // Get all displays
            auto displayInfos = winrt::DisplayInformation::GetForCurrentView();
            
            // Create the result array
            React::JSValueArray result;
            
            // Add the primary display
            React::JSValueObject primaryDisplay;
            primaryDisplay["id"] = "primary";
            primaryDisplay["name"] = "Primary Display";
            
            // Get the screen size
            auto bounds = winrt::Window::Current().Bounds();
            
            React::JSValueObject primaryBounds;
            primaryBounds["x"] = 0;
            primaryBounds["y"] = 0;
            primaryBounds["width"] = static_cast<int>(bounds.Width);
            primaryBounds["height"] = static_cast<int>(bounds.Height);
            
            primaryDisplay["bounds"] = std::move(primaryBounds);
            
            result.push_back(std::move(primaryDisplay));
            
            // Note: Getting multiple displays in UWP is more complex and requires
            // using the Windows.Devices.Enumeration API, which is beyond the scope
            // of this example. In a real implementation, you would enumerate all displays.
            
            promise.Resolve(result);
        } catch (const std::exception& e) {
            promise.Reject(e.what());
        }
    }

    // Helper method to get view bounds
    winrt::ApplicationViewBounds WindowManager::GetViewBounds(int viewId) {
        // This is a placeholder. In a real implementation, you would get the bounds of the view.
        return winrt::ApplicationViewBounds();
    }

    // Helper method to get application view for window ID
    winrt::ApplicationView WindowManager::GetApplicationViewForWindowId(int windowId) {
        if (m_windowMap.find(windowId) == m_windowMap.end()) {
            return nullptr;
        }

        int viewId = m_windowMap[windowId];
        
        // Get the view
        for (uint32_t i = 0; i < winrt::CoreApplication::Views().Size(); i++) {
            auto view = winrt::CoreApplication::Views().GetAt(i);
            auto appView = winrt::ApplicationView::GetForCurrentView();
            
            if (appView.Id() == viewId) {
                return appView;
            }
        }
        
        return nullptr;
    }

    // Helper method to get settings file
    winrt::IAsyncOperation<winrt::StorageFile> WindowManager::GetSettingsFile() {
        try {
            auto localFolder = winrt::ApplicationData::Current().LocalFolder();
            auto file = co_await localFolder.GetFileAsync(SETTINGS_FILE_NAME);
            co_return file;
        } catch (...) {
            // File doesn't exist, create it
            co_return co_await CreateSettingsFile();
        }
    }

    // Helper method to create settings file
    winrt::IAsyncOperation<winrt::StorageFile> WindowManager::CreateSettingsFile() {
        auto localFolder = winrt::ApplicationData::Current().LocalFolder();
        auto file = co_await localFolder.CreateFileAsync(SETTINGS_FILE_NAME, winrt::CreationCollisionOption::ReplaceExisting);
        
        // Write default settings
        std::wstring defaultSettings = L"{\"x\":100,\"y\":100,\"width\":800,\"height\":600,\"isMaximized\":false}";
        co_await WriteSettingsFile(defaultSettings);
        
        co_return file;
    }

    // Helper method to read settings file
    winrt::IAsyncOperation<std::wstring> WindowManager::ReadSettingsFile() {
        auto file = co_await GetSettingsFile();
        auto fileContent = co_await winrt::FileIO::ReadTextAsync(file);
        co_return fileContent.c_str();
    }

    // Helper method to write settings file
    winrt::IAsyncAction WindowManager::WriteSettingsFile(std::wstring content) {
        auto file = co_await GetSettingsFile();
        co_await winrt::FileIO::WriteTextAsync(file, content);
    }
}
