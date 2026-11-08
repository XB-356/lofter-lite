#!/bin/sh
# 需要: JDK 17+, android-sdk-platform-23, build-tools 29, tools/r8.jar
set -e
SDK=/usr/lib/android-sdk
AJ=$SDK/platforms/android-23/android.jar
BT=$SDK/build-tools/29.0.3
cd "$(dirname "$0")"
rm -rf assets/www build/classes build/dex build/gen
mkdir -p assets/www build/classes build/dex build/gen
cp -r ../public/* assets/www/
rm -f assets/www/sw.js assets/www/manifest.webmanifest

$BT/aapt package -f -m -J build/gen -M AndroidManifest.xml -S res -I $AJ -A assets
javac -encoding UTF-8 -source 8 -target 8 -bootclasspath $AJ \
  -d build/classes build/gen/com/lofterlite/R.java src/com/lofterlite/*.java
java -cp tools/r8.jar com.android.tools.r8.D8 --release --min-api 21 --lib $AJ \
  --output build/dex $(find build/classes -name '*.class')

$BT/aapt package -f -M AndroidManifest.xml -S res -I $AJ -A assets -F build/app-unsigned.apk
cp build/dex/classes.dex build/classes.dex
cd build
$BT/aapt add app-unsigned.apk classes.dex >/dev/null
$BT/zipalign -f 4 app-unsigned.apk app-aligned.apk
if [ ! -f lofter.jks ]; then
  keytool -genkeypair -keystore lofter.jks -alias lofter -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass lofterlite -keypass lofterlite -dname "CN=LOFTER Lite, O=Local"
fi
$BT/apksigner sign --ks lofter.jks --ks-pass pass:lofterlite --key-pass pass:lofterlite \
  --out lofter-lite.apk app-aligned.apk
echo "APK: $(pwd)/lofter-lite.apk"
