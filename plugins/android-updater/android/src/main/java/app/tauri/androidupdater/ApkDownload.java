package app.tauri.androidupdater;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.function.BiConsumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Resumes only artifacts pinned by SHA-256. Incomplete files are never installable APKs. */
public final class ApkDownload {
    public static void download(String url, File target, String sha256, BiConsumer<Long, Long> progress) throws IOException {
        String expected = sha256 == null ? "" : sha256.trim().toLowerCase(Locale.ROOT);
        if (!expected.isEmpty() && !expected.matches("[0-9a-f]{64}")) throw new IOException("无效的 APK 校验值");
        if (!expected.isEmpty() && target.isFile() && hash(target).equals(expected)) {
            progress.accept(target.length(), target.length());
            return;
        }
        File part = new File(target.getParentFile(), target.getName() + "." + (expected.isEmpty() ? "unverified" : expected) + ".part");
        for (int attempt = 0; ; attempt++) {
            try {
                if (expected.isEmpty() || !part.isFile() || !hash(part).equals(expected)) {
                    transfer(url, part, !expected.isEmpty(), progress);
                }
                if (!expected.isEmpty() && !hash(part).equals(expected)) {
                    if (!part.delete()) throw new IOException("无法清理损坏的安装包");
                    throw new IOException("APK 校验失败，重新下载");
                }
                if (!part.renameTo(target)) throw new IOException("无法保存已校验的安装包");
                progress.accept(target.length(), target.length());
                return;
            } catch (IOException error) {
                if (attempt >= 2) throw new IOException("下载未完成，请重试（已保留可续传的进度）：" + error.getMessage(), error);
            }
        }
    }

    private static void transfer(String url, File part, boolean resumable, BiConsumer<Long, Long> progress) throws IOException {
        long offset = resumable ? part.length() : 0;
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(30000);
        connection.setRequestProperty("Accept-Encoding", "identity");
        if (offset > 0) connection.setRequestProperty("Range", "bytes=" + offset + "-");
        try {
            int status = connection.getResponseCode();
            long total;
            if (status == 206) {
                Matcher range = Pattern.compile("bytes (\\d+)-(\\d+)/(\\d+)").matcher(String.valueOf(connection.getHeaderField("Content-Range")));
                try {
                    if (!range.matches() || Long.parseLong(range.group(1)) != offset) throw new IllegalArgumentException();
                    total = Long.parseLong(range.group(3));
                    long end = Long.parseLong(range.group(2));
                    if (end < offset || end >= total) throw new IllegalArgumentException();
                } catch (IllegalArgumentException error) {
                    if (part.exists() && !part.delete()) throw new IOException("无法清理无效的续传文件");
                    throw new IOException("服务器返回无效的续传范围", error);
                }
            } else if (status == 200) {
                offset = 0; // Servers may ignore Range: replace, never append the full response.
                total = connection.getContentLengthLong();
            } else {
                if (status == 416 && part.exists() && !part.delete()) throw new IOException("无法重置续传文件");
                throw new IOException("HTTP " + status);
            }
            progress.accept(offset, total);
            long downloaded = offset;
            long lastEmit = 0;
            byte[] buffer = new byte[64 * 1024];
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(part, offset > 0)) {
                int count;
                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                    downloaded += count;
                    long now = System.nanoTime();
                    if (now - lastEmit > 200_000_000L) {
                        progress.accept(downloaded, total);
                        lastEmit = now;
                    }
                }
            }
            if (total >= 0 && downloaded != total) throw new IOException("连接中断，安装包尚未下载完整");
        } finally {
            connection.disconnect();
        }
    }

    private static String hash(File file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[64 * 1024];
            try (InputStream input = new FileInputStream(file)) {
                int count;
                while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
            }
            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b & 255));
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
