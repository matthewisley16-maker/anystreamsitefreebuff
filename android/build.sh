#!/usr/bin/env bash
# Builds the two Android artifacts without Gradle: aapt2 -> javac -> d8 ->
# zipalign -> apksigner. Run from anywhere: ./android/build.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID="$ROOT/android"
SDK="$ROOT/.tools/android-sdk"
JDK="$ROOT/.tools/jdk"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"
OUT="$ROOT/dist/android"
KS="$ROOT/.tools/anystreamsite.keystore"

for tool in "$BT/aapt2.exe" "$BT/d8.bat" "$BT/zipalign.exe" "$BT/apksigner.bat" "$PLATFORM" "$JDK/bin/javac.exe"; do
  [ -e "$tool" ] || { echo "missing build tool: $tool"; exit 1; }
done

export JAVA_HOME="$(cygpath -m "$JDK")"
export PATH="$ROOT/.tools/node:$JDK/bin:$PATH"
mkdir -p "$OUT"

if [ ! -f "$KS" ]; then
  echo "== creating signing key =="
  keytool -genkeypair -keystore "$KS" -alias anystreamsite \
    -storepass anystreamsite -keypass anystreamsite \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=anystreamsite,O=anystreamsite,C=US" > /dev/null 2>&1
fi

build_variant() {
  local variant="$1"
  local outname="$2"
  local work="$ROOT/.tools/apk-build/$variant"

  rm -rf "$work"
  mkdir -p "$work/res" "$work/assets/www" "$work/classes" "$work/dex" "$work/gen"

  cp -r "$ANDROID/res/." "$work/res/"
  cp "$ANDROID/assets/site-dpad.js" "$work/assets/site-dpad.js"
  node "$ANDROID/tools/inject.js" "$ROOT/index.html" "$work/assets/www/index.html" "$variant"
  powershell -NoProfile -ExecutionPolicy Bypass -File "$ANDROID/tools/make-art.ps1" \
    -Source "$ROOT/anystream-icon.png" -ResDir "$work/res"

  echo "== $variant: resources =="
  "$BT/aapt2.exe" compile --dir "$work/res" -o "$work/res.zip"
  # Assets are added after linking, not with -A: on Windows aapt2 writes them
  # with backslash separators, which AssetManager cannot open.
  "$BT/aapt2.exe" link -o "$work/base.apk" -I "$PLATFORM" \
    --manifest "$ANDROID/manifests/AndroidManifest.$variant.xml" \
    -R "$work/res.zip" --java "$work/gen" --auto-add-overlay

  echo "== $variant: java =="
  find "$ANDROID/java" "$work/gen" "$ANDROID/variants/$variant/java" -name '*.java' | while read -r f; do cygpath -m "$f"; done > "$work/sources.txt"
  "$JDK/bin/javac.exe" -nowarn -encoding UTF-8 -source 8 -target 8 \
    -bootclasspath "$PLATFORM" -d "$work/classes" @"$work/sources.txt"

  echo "== $variant: dex =="
  find "$work/classes" -name '*.class' | while read -r f; do cygpath -m "$f"; done > "$work/classes.txt"
  "$BT/d8.bat" --lib "$PLATFORM" --min-api 23 --output "$work/dex" @"$work/classes.txt"

  echo "== $variant: package =="
  cp "$work/base.apk" "$work/unsigned.apk"
  local apk_win dex_win assets_win
  apk_win="$(cygpath -m "$work/unsigned.apk")"
  dex_win="$(cygpath -m "$work/dex/classes.dex")"
  assets_win="$(cygpath -m "$work/assets")"
  powershell -NoProfile -Command "
    Add-Type -AssemblyName System.IO.Compression.FileSystem;
    \$z=[System.IO.Compression.ZipFile]::Open('$apk_win','Update');
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(\$z,'$dex_win','classes.dex',[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null;
    \$root='$assets_win';
    Get-ChildItem -Path \$root -Recurse -File | ForEach-Object {
      \$name='assets/'+\$_.FullName.Substring(\$root.Length+1).Replace([string][char]92,'/');
      if (-not \$z.GetEntry(\$name)) { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(\$z,\$_.FullName,\$name,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null }
    };
    \$z.Dispose()"

  "$BT/zipalign.exe" -f -p 4 "$work/unsigned.apk" "$work/aligned.apk"
  "$BT/apksigner.bat" sign --ks "$KS" --ks-pass pass:anystreamsite --key-pass pass:anystreamsite \
    --ks-key-alias anystreamsite --out "$OUT/$outname" "$work/aligned.apk"

  echo "== $variant: verify =="
  "$BT/apksigner.bat" verify --print-certs "$OUT/$outname" | head -4
  "$BT/aapt2.exe" dump badging "$OUT/$outname" | head -3
  ls -lh "$OUT/$outname" | awk '{print "  size:", $5}'
}

build_variant phone "anystreamsitev1.1-phone.apk"
build_variant tv "anystreamsitev1.1-android-tv.apk"

echo "== done =="
ls -lh "$OUT"/*.apk
