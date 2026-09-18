const COMMANDS: &[&str] = &["get_version_info", "download_and_install", "install_downloaded_apk"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .try_build()
        .unwrap();
}
