//! Android 应用内更新插件。
//!
//! JS 侧 invoke `plugin:android-updater|<snake_case>`；Android 运行时会转成 camelCase
//! 查找 Kotlin `@Command` 方法（如 `download_and_install` → `downloadAndInstall`）。
//! - `get_version_info` / `getVersionInfo`
//! - `download_and_install` / `downloadAndInstall`
//! - `install_downloaded_apk` / `installDownloadedApk`

use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Runtime,
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "app.tauri.androidupdater";

/// 初始化插件。仅在 Android 上注册原生实现。
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("android-updater")
        .setup(|_app: &AppHandle<R>, _api| {
            #[cfg(target_os = "android")]
            {
                let _handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "AndroidUpdaterPlugin")?;
            }
            Ok(())
        })
        .build()
}
