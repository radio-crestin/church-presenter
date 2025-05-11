#include "pch.h"
#include "ReactPackageProvider.h"
#include "NativeModules.h"
#include "WindowManager.h"

using namespace winrt::Microsoft::ReactNative;

namespace winrt::churchPresenter::implementation
{

void ReactPackageProvider::CreatePackage(IReactPackageBuilder const &packageBuilder) noexcept
{
    AddAttributedModules(packageBuilder, true);
    
    // Register WindowManager module
    RegisterNativeModule<WindowManagerModule::WindowManager>(packageBuilder);
}

} // namespace winrt::churchPresenter::implementation
