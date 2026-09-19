#!/usr/bin/env bash
#
# 构建 + 签名 Android APK，生成更新清单 latest.json，并上传到服务器。
#
# 用法:
#   scripts/release-apk.sh                  # 使用 tauri.conf.json 中的当前版本
#   scripts/release-apk.sh 0.2.1 "更新说明"  # 指定版本号与更新说明
#
# 环境变量:
#   SERVER_HOST   必填，例如 user@your-server
#   SERVER_DIR    默认 /opt/assistant/updates
#   PUBLIC_BASE   默认 https://train.5wjw.cn/updates
#   KEYSTORE      默认 apps/mobile/src-tauri/gen/android/assistant-release.keystore
#   KEYSTORE_PASS 必填（切勿写入仓库）
#   KEY_ALIAS     默认 assistant

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$REPO_ROOT/apps/mobile"
ANDROID_DIR="$MOBILE_DIR/src-tauri/gen/android"
CONF="$MOBILE_DIR/src-tauri/tauri.conf.json"

SERVER_HOST="${SERVER_HOST:?Set SERVER_HOST (e.g. user@your-server)}"
SERVER_DIR="${SERVER_DIR:-/opt/assistant/updates}"
PUBLIC_BASE="${PUBLIC_BASE:-https://train.5wjw.cn/updates}"
KEYSTORE="${KEYSTORE:-$ANDROID_DIR/assistant-release.keystore}"
KEYSTORE_PASS="${KEYSTORE_PASS:?Set KEYSTORE_PASS (do not commit this value)}"
KEY_ALIAS="${KEY_ALIAS:-assistant}"

TARGET="${TARGET:-aarch64}"
ABI_DIR="arm64-v8a"
: "${ANDROID_HOME:=$HOME/Library/Android/sdk}"
export ANDROID_HOME
: "${JAVA_HOME:=$(/usr/libexec/java_home -v 17 2>/dev/null || true)}"
export JAVA_HOME
: "${NDK_HOME:=$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | tail -1 || true)}"
export NDK_HOME
PATH="$JAVA_HOME/bin:$PATH"

BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -1)"

# ---------------------------------------------------------------- 版本号

if [[ $# -ge 1 ]]; then
  VERSION="$1"
  /usr/bin/env python3 - "$CONF" "$VERSION" <<'PY'
import json, sys
path, version = sys.argv[1], sys.argv[2]
with open(path, encoding='utf-8') as fh:
    conf = json.load(fh)
conf['version'] = version
with open(path, 'w', encoding='utf-8') as fh:
    json.dump(conf, fh, ensure_ascii=False, indent=2)
    fh.write('\n')
PY
else
  VERSION="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))['version'])" "$CONF")"
fi

NOTES="${2:-}"
IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<<"$VERSION"
VERSION_CODE=$(( V_MAJOR * 1000000 + V_MINOR * 1000 + V_PATCH ))
APK_NAME="personal-ai-assistant-v${VERSION}-${TARGET}.apk"

echo "==> 版本: $VERSION (versionCode=$VERSION_CODE)"

# ---------------------------------------------------------------- 构建

OVERLAY="$MOBILE_DIR/src-tauri/android-overlay"
APP_SRC="$ANDROID_DIR/app/src/main"
if [[ -d "$OVERLAY" && -d "$APP_SRC" ]]; then
  echo "==> 同步 Android 主题覆盖（透明状态栏）"
  cp "$OVERLAY/MainActivity.kt" "$APP_SRC/java/com/assistant/app/MainActivity.kt"
  mkdir -p "$APP_SRC/res/values" "$APP_SRC/res/values-night"
  cp "$OVERLAY/res/values/colors.xml" "$APP_SRC/res/values/colors.xml"
  cp "$OVERLAY/res/values/themes.xml" "$APP_SRC/res/values/themes.xml"
  cp "$OVERLAY/res/values-night/themes.xml" "$APP_SRC/res/values-night/themes.xml"
fi

echo "==> 构建 APK (release, $TARGET)"
( cd "$MOBILE_DIR" && npx tauri android build --apk --target "$TARGET" )

OUT_DIR="$ANDROID_DIR/app/build/outputs/apk/universal/release"
UNSIGNED="$OUT_DIR/app-universal-release-unsigned.apk"
[[ -f "$UNSIGNED" ]] || { echo "找不到未签名 APK: $UNSIGNED" >&2; exit 1; }

ALIGNED="$OUT_DIR/app-aligned.apk"
SIGNED="$OUT_DIR/$APK_NAME"

echo "==> 对齐与签名"
"$BUILD_TOOLS/zipalign" -p -f 4 "$UNSIGNED" "$ALIGNED"
"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-pass "pass:$KEYSTORE_PASS" \
  --key-pass "pass:$KEYSTORE_PASS" \
  --ks-key-alias "$KEY_ALIAS" \
  --out "$SIGNED" "$ALIGNED"
"$BUILD_TOOLS/apksigner" verify "$SIGNED"

SHA256="$(shasum -a 256 "$SIGNED" | awk '{print $1}')"
SIZE="$(stat -f%z "$SIGNED")"
echo "==> sha256: $SHA256"

ACTUAL_CODE="$("$ANDROID_HOME/cmdline-tools/latest/bin/apkanalyzer" manifest print "$SIGNED" 2>/dev/null | sed -nE 's/.*android:versionCode="([0-9]+)".*/\1/p' | head -1)"
if [[ -n "$ACTUAL_CODE" && "$ACTUAL_CODE" != "$VERSION_CODE" ]]; then
  echo "!! 警告: APK 实际 versionCode=$ACTUAL_CODE 与推算值 $VERSION_CODE 不一致" >&2
  VERSION_CODE="$ACTUAL_CODE"
fi

# ---------------------------------------------------------------- 更新清单

LATEST_JSON="$(mktemp)"
python3 - "$LATEST_JSON" "$VERSION" "$VERSION_CODE" "$PUBLIC_BASE/$APK_NAME" "$SHA256" "$NOTES" <<'PY'
import json, sys
from datetime import datetime, timezone

out, version, code, url, sha256, notes = sys.argv[1:7]
manifest = {
    "version": version,
    "versionCode": int(code),
    "url": url,
    "sha256": sha256,
    "notes": notes,
    "pubDate": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
}
with open(out, "w", encoding='utf-8') as fh:
    json.dump(manifest, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY

cat "$LATEST_JSON"
echo "==> 上传 APK 与 latest.json 到 $SERVER_HOST:$SERVER_DIR"
ssh "$SERVER_HOST" "mkdir -p '$SERVER_DIR'"
scp "$SIGNED" "$SERVER_HOST:$SERVER_DIR/$APK_NAME"
scp "$LATEST_JSON" "$SERVER_HOST:$SERVER_DIR/latest.json"
rm -f "$LATEST_JSON"

# 保留最近 3 个 APK，避免磁盘堆积
ssh "$SERVER_HOST" "ls -1t '$SERVER_DIR'/*.apk 2>/dev/null | tail -n +4 | xargs -r rm -f"

echo
echo "完成：$PUBLIC_BASE/$APK_NAME"
echo "清单：$PUBLIC_BASE/latest.json"
