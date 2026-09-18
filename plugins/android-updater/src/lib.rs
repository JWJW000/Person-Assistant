//! Android 应用内更新插件。
//!
//! JS 侧直接 invoke `plugin:android-updater|<command>`，命令由 Kotlin 实现：
//! - `get_version_info`：返回已安装应用的 versionName / versionCode 等信息
//! - `download_and_install`：下载 APK 并唤起系统安装器（进度通过 Channel 回传）
//! - `install_downloaded_apk`：在用户授予「安装未知应用」权限后，直接安装已下载的 APK

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
