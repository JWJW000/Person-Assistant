# 保留 Tauri 注解与插件类，避免混淆导致的反射查找失败
-keep class app.tauri.androidupdater.** { *; }
-keepattributes *Annotation*
