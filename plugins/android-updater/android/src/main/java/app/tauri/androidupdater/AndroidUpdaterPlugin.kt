// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

package app.tauri.androidupdater

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.util.concurrent.Executors

private const val UPDATE_DIR = "updates"
private const val MIME_APK = "application/vnd.android.package-archive"
private const val EVENT_FINISHED = "finished"
private const val EVENT_ERROR = "error"

@InvokeArg
class DownloadOptions {
    lateinit var url: String
    var fileName: String? = null
    var sha256: String? = null
    var versionName: String? = null
    var onEvent: Channel? = null
}

@InvokeArg
class InstallOptions {
    var fileName: String? = null
    var onEvent: Channel? = null
}

@TauriPlugin
class AndroidUpdaterPlugin(private val activity: Activity) : Plugin(activity) {

    private val executor = Executors.newSingleThreadExecutor()

    // Tauri 把 JS 的 snake_case 命令转成 lowerCamelCase 再按 Kotlin 方法名查找。
    // 同时保留下划线别名，避免旧路径漏转换。

    @Command
    fun getVersionInfo(invoke: Invoke) {
        try {
            val result = JSObject()
            result.put("versionName", currentVersionName())
            result.put("versionCode", currentVersionCode())
            result.put("packageName", activity.packageName)
            result.put("canInstallPackages", canInstallPackages())
            invoke.resolve(result)
        } catch (e: Exception) {
            invoke.reject(e.message, null, e, null)
        }
    }

    @Command
    fun get_version_info(invoke: Invoke) = getVersionInfo(invoke)

    @Command
    fun downloadAndInstall(invoke: Invoke) {
        val options = invoke.parseArgs(DownloadOptions::class.java)
        val url = options.url
        if (url.isEmpty()) {
            invoke.reject("url 不能为空", "INVALID_ARGS", null, null)
            return
        }

        if (!canInstallPackages()) {
            openUnknownSourcesSettings()
            invoke.reject("需要先允许本应用「安装未知应用」", "INSTALL_PERMISSION_REQUIRED", null, null)
            return
        }

        // 立即返回，下载进度通过 Channel 推送
        invoke.resolve()

        executor.execute {
            try {
                val fileName = resolveFileName(options.fileName, url)
                val dir = File(activity.cacheDir, UPDATE_DIR)
                if (!dir.exists() && !dir.mkdirs()) {
                    throw IllegalStateException("无法创建更新缓存目录")
                }
                dir.listFiles()?.forEach { if (it.name != fileName && !it.name.startsWith("$fileName.")) it.delete() }

                val target = File(dir, fileName)
                ApkDownload.download(url, target, options.sha256) { downloaded, total ->
                    emit(options.onEvent, JSObject().apply {
                        put("event", "progress")
                        put("downloaded", downloaded)
                        put("total", if (total > 0) total else 0L)
                    })
                }

                emit(options.onEvent, JSObject().apply {
                    put("event", EVENT_FINISHED)
                    put("downloaded", target.length())
                    put("total", target.length())
                    put("fileName", fileName)
                })

                launchInstaller(target)
            } catch (e: Exception) {
                emit(options.onEvent, JSObject().apply {
                    put("event", EVENT_ERROR)
                    put("message", e.message ?: "下载更新失败")
                })
            }
        }
    }

    @Command
    fun download_and_install(invoke: Invoke) = downloadAndInstall(invoke)

    @Command
    fun installDownloadedApk(invoke: Invoke) {
        val options = invoke.parseArgs(InstallOptions::class.java)
        if (!canInstallPackages()) {
            openUnknownSourcesSettings()
            invoke.reject("需要先允许本应用「安装未知应用」", "INSTALL_PERMISSION_REQUIRED", null, null)
            return
        }

        val dir = File(activity.cacheDir, UPDATE_DIR)
        val file = options.fileName?.let { File(dir, resolveFileName(it, "")) }
            ?: dir.listFiles()?.filter { it.extension.equals("apk", true) }?.maxByOrNull { it.lastModified() }

        if (file == null || !file.exists()) {
            invoke.reject("尚未下载 APK，请先下载", "NO_APK", null, null)
            return
        }

        try {
            launchInstaller(file)
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject(e.message, null, e, null)
        }
    }

    @Command
    fun install_downloaded_apk(invoke: Invoke) = installDownloadedApk(invoke)

    // ---------------------------------------------------------------- helpers

    private fun resolveFileName(provided: String?, url: String): String {
        val name = provided?.trim().orEmpty().ifEmpty {
            url.substringAfterLast('/').substringBefore('?').ifEmpty { "update.apk" }
        }
        require(name == File(name).name && name != "." && name != ".." && !name.contains('\\')) { "无效的安装包文件名" }
        return if (name.endsWith(".apk", ignoreCase = true)) name else "$name.apk"
    }

    private fun launchInstaller(file: File) {
        val authority = activity.packageName + ".fileprovider"
        val uri = FileProvider.getUriForFile(activity, authority, file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, MIME_APK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.runOnUiThread { activity.startActivity(intent) }
    }

    private fun emit(channel: Channel?, payload: JSObject) {
        try {
            channel?.send(payload)
        } catch (_: Exception) {
            // 通道已关闭（用户离开页面）时忽略
        }
    }

    private fun canInstallPackages(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.packageManager.canRequestPackageInstalls()
        } else {
            true
        }

    private fun openUnknownSourcesSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${activity.packageName}")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.runOnUiThread { activity.startActivity(intent) }
        } catch (_: Exception) {
        }
    }

    private fun currentVersionName(): String =
        try {
            activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: ""
        } catch (_: PackageManager.NameNotFoundException) {
            ""
        }

    private fun currentVersionCode(): Long =
        try {
            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                activity.packageManager.getPackageInfo(
                    activity.packageName,
                    PackageManager.PackageInfoFlags.of(0)
                )
            } else {
                @Suppress("DEPRECATION")
                activity.packageManager.getPackageInfo(activity.packageName, 0)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else {
                @Suppress("DEPRECATION")
                info.versionCode.toLong()
            }
        } catch (_: PackageManager.NameNotFoundException) {
            0L
        }
}
