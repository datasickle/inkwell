#!/usr/bin/env bash
# 本机构建 APK。工具链全部装在 D 盘，不动系统环境。
#   用法：bash tools/build-apk.sh
# 依赖（已装好）：
#   D:\android-dev\jdk21        Temurin JDK 21
#   D:\android-dev\sdk          Android SDK（platform-36 / build-tools 36.0.0）
#   D:\android-dev\gradle-home  Gradle 缓存与发行包

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

export JAVA_HOME="${JAVA_HOME:-D:\\android-dev\\jdk21}"
export ANDROID_HOME="${ANDROID_HOME:-D:\\android-dev\\sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-D:\\android-dev\\gradle-home}"
# 把 .android 目录（debug.keystore 在这里）也放到 D 盘，C 盘不留东西。
# 密钥固定在这一处，重装 APK 才能覆盖安装。
export ANDROID_USER_HOME="${ANDROID_USER_HOME:-D:\\android-dev\\android-home}"
export SDK_TEST_BASE_URL="${SDK_TEST_BASE_URL:-https://mirrors.cloud.tencent.com/AndroidSDK/}"

echo "JAVA_HOME       = $JAVA_HOME"
echo "ANDROID_HOME    = $ANDROID_HOME"
echo "GRADLE_USER_HOME= $GRADLE_USER_HOME"
echo

# dl.google.com 在国内直连不通，需要把依赖源换成镜像。
# 放在 init.d 里自动生效，这样不必改动项目文件，CI 也不受影响。
INIT_DIR="$GRADLE_USER_HOME/init.d"
if [ ! -f "$INIT_DIR/mirrors.gradle" ]; then
  mkdir -p "$INIT_DIR"
  cat > "$INIT_DIR/mirrors.gradle" <<'GRADLE_EOF'
def mirrors = [
    'https://maven.aliyun.com/repository/google',
    'https://maven.aliyun.com/repository/public',
    'https://maven.aliyun.com/repository/gradle-plugin',
]
gradle.beforeProject { project ->
    project.buildscript.repositories { mirrors.each { u -> maven { url = u } } }
    project.repositories { mirrors.each { u -> maven { url = u } } }
}
settingsEvaluated { settings ->
    settings.pluginManagement.repositories { mirrors.each { u -> maven { url = u } } }
}
GRADLE_EOF
  echo "已写入镜像配置：$INIT_DIR/mirrors.gradle"
fi

cd "$ROOT"

echo "[1/3] 把写作台同步进原生工程"
npx --no-install cap sync android

echo
echo "[2/3] 编译"
cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon "$@"

echo
echo "[3/3] 产物"
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
  echo "没有找到 APK，构建可能失败" >&2
  exit 1
fi

ls -lh "$APK"
echo "构建产物：$APK"

# 直接覆盖交付目录里那份。以前靠手动 cp，漏过一次会把旧包当新包发出去。
OUT="${APK_OUT:-/d/android-dev/out/inkwell-1.0-debug.apk}"
mkdir -p "$(dirname "$OUT")"
cp "$APK" "$OUT"
echo "已交付到：$OUT"
echo "SHA-256 ：$(sha256sum "$OUT" | cut -d' ' -f1)"
