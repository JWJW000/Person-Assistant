#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
output=$(mktemp -d)
trap 'rm -rf "$output"' EXIT
javac -d "$output" "$root/android/src/main/java/app/tauri/androidupdater/ApkDownload.java" "$root/tests/ApkDownloadTest.java"
java -cp "$output" app.tauri.androidupdater.ApkDownloadTest
