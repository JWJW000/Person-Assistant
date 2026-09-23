package app.tauri.androidupdater;

import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

// Run with JDK 17; see tests/run.sh. No Android device or external network needed.
public class ApkDownloadTest {
    public static void main(String[] args) throws Exception {
        byte[] apk = new byte[200000];
        new Random(17).nextBytes(apk);
        String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(apk));
        File dir = Files.createTempDirectory("apk-resume-").toFile();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicInteger count = new AtomicInteger();
        List<String> ranges = new ArrayList<>();
        server.createContext("/", exchange -> {
            int request = count.incrementAndGet();
            String path = exchange.getRequestURI().getPath();
            String range = exchange.getRequestHeaders().getFirst("Range");
            ranges.add(range);
            int start = range == null ? 0 : Integer.parseInt(range.substring(6, range.length() - 1));
            if (path.equals("/ignore")) start = 0;
            if (start >= apk.length) {
                exchange.sendResponseHeaders(416, -1);
            } else {
                int status = start == 0 ? 200 : 206;
                if (status == 206) exchange.getResponseHeaders().set("Content-Range", "bytes " + (path.equals("/bad-range") ? 1 : start) + "-" + (apk.length - 1) + "/" + apk.length);
                exchange.sendResponseHeaders(status, apk.length - start);
                byte[] body = apk.clone();
                if (path.equals("/corrupt")) body[100] ^= 1;
                int length = (path.equals("/interrupt") && request == 1) || path.equals("/always-interrupt") ? 10000 : apk.length - start;
                try { exchange.getResponseBody().write(body, start, length); } catch (IOException ignored) {}
            }
            exchange.close();
        });
        server.start();
        String url = "http://127.0.0.1:" + server.getAddress().getPort();
        try {
            File target = new File(dir, "update.apk");
            File part = new File(dir, "update.apk." + sha + ".part");
            ApkDownload.download(url + "/interrupt", target, sha, (n, total) -> {});
            check(Arrays.equals(apk, Files.readAllBytes(target.toPath())), "interrupted download recovered");
            check(ranges.contains("bytes=10000-"), "automatic retry sends Range");
            int completedRequests = count.get();
            ApkDownload.download(url + "/", target, sha, (n, total) -> {});
            check(count.get() == completedRequests, "verified completed file reused without network");
            target.delete();

            boolean failed = false;
            try { ApkDownload.download(url + "/always-interrupt", target, sha, (n, total) -> {}); }
            catch (IOException expected) { failed = true; }
            check(failed && !target.exists() && part.length() == 30000, "exhausted retries preserve partial without installable file");
            ranges.clear();
            ApkDownload.download(url + "/", target, sha, (n, total) -> {});
            check("bytes=30000-".equals(ranges.get(0)), "later invocation resumes saved bytes");
            check(Arrays.equals(apk, Files.readAllBytes(target.toPath())), "manual resume completes verified file");

            for (String path : List.of("/ignore", "/bad-range", "/")) {
                target.delete();
                byte[] prefix = path.equals("/") ? new byte[apk.length + 1] : Arrays.copyOf(apk, 12345);
                Files.write(part.toPath(), prefix);
                ApkDownload.download(url + path, target, sha, (n, total) -> {});
                check(Arrays.equals(apk, Files.readAllBytes(target.toPath())), "safe fallback: " + path);
            }
            target.delete();
            Files.write(part.toPath(), apk);
            completedRequests = count.get();
            ApkDownload.download(url + "/", target, sha, (n, total) -> {});
            check(count.get() == completedRequests && target.exists(), "complete partial recovered without 416");
            target.delete();
            failed = false;
            try { ApkDownload.download(url + "/corrupt", target, sha, (n, total) -> {}); }
            catch (IOException expected) { failed = true; }
            check(failed && !target.exists() && !part.exists(), "checksum failure never becomes installable");

            Files.write(new File(dir, "update.apk.unverified.part").toPath(), new byte[50]);
            ranges.clear();
            ApkDownload.download(url + "/", target, null, (n, total) -> {});
            check(ranges.get(0) == null && Arrays.equals(apk, Files.readAllBytes(target.toPath())), "no digest disables unsafe resume");
            System.out.println("PASS: interruption, persisted resume, cached complete file, ignored Range, malformed 206, 416, completed partial, checksum rejection, no-digest fallback");
        } finally {
            server.stop(0);
            for (File file : Objects.requireNonNull(dir.listFiles())) file.delete();
            dir.delete();
        }
    }
    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
    }
}
