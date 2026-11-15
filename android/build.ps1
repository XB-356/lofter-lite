# LOFTER Lite Windows 打包脚本（不需要 Android Studio / Gradle）
#
# 依赖（最小件，全部解压即用）：
#   JDK 17+（javac / java / keytool 在 PATH 上）
#   <SDK>\platform-tools\adb.exe
#   <SDK>\build-tools\29.0.3\{aapt.exe,d8.bat,zipalign.exe,apksigner.bat,lib\d8.jar}
#   <SDK>\platforms\android-23\android.jar
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File android\build.ps1
#   powershell ... -File android\build.ps1 -Sdk D:\Android\sdk
#
# 产物：android\build\lofter-lite.apk（签名用 android\lofter.jks，首次自动生成）
param(
    [string]$Sdk = "",
    # 打 debug 包：manifest 加 android:debuggable=true，并开启 WebView 远程调试（chrome://inspect）
    [switch]$Debug
)

$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host "→ $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "✓ $msg" -ForegroundColor Green }
function Die($msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

$here = $PSScriptRoot
$root = Split-Path -Parent $here
Push-Location $here
try {
    # ---------- 定位 SDK ----------
    if (-not $Sdk) {
        if ($env:ANDROID_HOME) { $Sdk = $env:ANDROID_HOME }
        elseif ($env:ANDROID_SDK_ROOT) { $Sdk = $env:ANDROID_SDK_ROOT }
        elseif (Test-Path 'D:\Android\sdk') { $Sdk = 'D:\Android\sdk' }
        else { Die '没找到 Android SDK，用 -Sdk 指定，或设置 ANDROID_HOME（见 README）' }
    }
    $AJ = Join-Path $Sdk 'platforms\android-23\android.jar'
    $BT = Join-Path $Sdk 'build-tools\29.0.3'
    foreach ($p in @($AJ, (Join-Path $BT 'aapt.exe'), (Join-Path $BT 'zipalign.exe'), (Join-Path $BT 'apksigner.bat'), (Join-Path $BT 'lib\d8.jar'))) {
        if (-not (Test-Path $p)) { Die "SDK 缺文件：$p" }
    }
    # JDK：javapath 里有 java/javac 但没有 keytool，所以要显式找 JDK 主目录
    function Find-Jdk {
        $cands = @()
        if ($env:JAVA_HOME) { $cands += $env:JAVA_HOME }
        foreach ($base in @('C:\Program Files\Java', 'C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Microsoft')) {
            if (Test-Path $base) {
                $cands += (Get-ChildItem $base -Directory -ErrorAction SilentlyContinue |
                    Where-Object { Test-Path (Join-Path $_.FullName 'bin\javac.exe') } |
                    Sort-Object Name -Descending | ForEach-Object { $_.FullName })
            }
        }
        foreach ($c in $cands) {
            if (Test-Path (Join-Path $c 'bin\keytool.exe')) { return $c }
        }
        return $null
    }
    $jdk = Find-Jdk
    if (-not $jdk) { Die '没找到 JDK（需要 bin\javac.exe 和 bin\keytool.exe），请装 JDK 17+ 或设置 JAVA_HOME' }
    $javaExe = Join-Path $jdk 'bin\java.exe'
    $javacExe = Join-Path $jdk 'bin\javac.exe'
    $keytoolExe = Join-Path $jdk 'bin\keytool.exe'
    Step "SDK = $Sdk"
    Step "JDK = $jdk"

    # ---------- 清理并拷前端 ----------
    Step '清理 build/ 与 assets/www'
    foreach ($d in @('assets\www', 'build\classes', 'build\dex', 'build\gen', 'build\app-unsigned.apk', 'build\app-aligned.apk', 'build\classes.dex')) {
        if (Test-Path $d) { Remove-Item -Recurse -Force $d }
    }
    New-Item -ItemType Directory -Force 'assets\www', 'build\classes', 'build\dex', 'build\gen' | Out-Null
    Copy-Item (Join-Path $root 'public\*') 'assets\www' -Recurse -Force
    # 网页版专用、APK 里不要
    foreach ($f in @('assets\www\sw.js', 'assets\www\manifest.webmanifest')) {
        if (Test-Path $f) { Remove-Item -Force $f }
    }
    Ok "public/ → assets/www（$( (Get-ChildItem assets\www -Recurse -File).Count ) 个文件）"

    # ---------- aapt 生成 R.java ----------
    Step 'aapt: 生成 R.java'
    & (Join-Path $BT 'aapt.exe') package -f -m -J build\gen -M AndroidManifest.xml -S res -I $AJ -A assets
    if ($LASTEXITCODE -ne 0) { Die 'aapt 生成 R.java 失败' }

    # ---------- javac ----------
    Step 'javac: 编译 Java 源码'
    $srcs = @()
    $srcs += (Get-ChildItem build\gen -Recurse -Filter *.java | ForEach-Object { $_.FullName })
    $srcs += (Get-ChildItem src -Recurse -Filter *.java | ForEach-Object { $_.FullName })
    # --release 8 限制只能用 Java 8 API；android.jar 通过 classpath 提供 android.* 类
    & $javacExe -J-Xmx512m -encoding UTF-8 --release 8 -nowarn -Xlint:-options -classpath $AJ -d build\classes $srcs
    if ($LASTEXITCODE -ne 0) { Die 'javac 编译失败' }

    # ---------- d8 转 dex ----------
    Step 'd8: class → dex'
    $classes = @(Get-ChildItem build\classes -Recurse -Filter *.class | ForEach-Object { $_.FullName })
    & $javaExe -Xmx512m -cp (Join-Path $BT 'lib\d8.jar') com.android.tools.r8.D8 --release --min-api 21 --lib $AJ --output build\dex $classes
    if ($LASTEXITCODE -ne 0) { Die 'd8 失败' }

    # ---------- 打包 APK ----------
    Step 'aapt: 打包资源'
    $packArgs = @('package', '-f', '-M', 'AndroidManifest.xml', '-S', 'res', '-I', $AJ, '-A', 'assets', '-F', 'build\app-unsigned.apk')
    if ($Debug) { $packArgs += '--debug-mode' }   # 让 aapt 在 manifest 里插入 android:debuggable=true
    & (Join-Path $BT 'aapt.exe') @packArgs
    if ($LASTEXITCODE -ne 0) { Die 'aapt 打包失败' }
    Copy-Item build\dex\classes.dex build\classes.dex -Force
    Push-Location build
    & (Join-Path $BT 'aapt.exe') add app-unsigned.apk classes.dex | Out-Null
    if ($LASTEXITCODE -ne 0) { Pop-Location; Die 'aapt add classes.dex 失败' }
    Pop-Location

    Step 'zipalign: 对齐'
    & (Join-Path $BT 'zipalign.exe') -f 4 build\app-unsigned.apk build\app-aligned.apk
    if ($LASTEXITCODE -ne 0) { Die 'zipalign 失败' }

    # ---------- 签名 ----------
    $ks = Join-Path $here 'lofter.jks'
    if (-not (Test-Path $ks)) {
        Step 'keytool: 生成签名证书 lofter.jks（密码 lofterlite，只用于本地测试）'
        & $keytoolExe -genkeypair -keystore $ks -alias lofter -keyalg RSA -keysize 2048 `
            -validity 10000 -storepass lofterlite -keypass lofterlite `
            -dname 'CN=LOFTER Lite, O=Local'
        if ($LASTEXITCODE -ne 0) { Die 'keytool 生成证书失败' }
    }
    Step 'apksigner: 签名'
    # 不能直接调 apksigner.bat：它依赖 SDK 里的 tools\lib\find_java.bat 来定位 java，
    # 而我们只装了最小件，bat 会静默 :EOF 退出（exit 0 但什么都不产出）。直接用 java -jar。
    $apk = Join-Path $here $(if ($Debug) { 'build\lofter-lite-debug.apk' } else { 'build\lofter-lite.apk' })
    if (Test-Path $apk) { Remove-Item -Force $apk }
    & $javaExe -jar (Join-Path $BT 'lib\apksigner.jar') sign --ks $ks `
        --ks-pass pass:lofterlite --key-pass pass:lofterlite `
        --out $apk (Join-Path $here 'build\app-aligned.apk')
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $apk)) { Die 'apksigner 签名失败' }

    $size = [math]::Round((Get-Item $apk).Length / 1KB, 1)
    Ok "APK: $apk ($size KB)$(if ($Debug) { '  [debug: debuggable + WebView 远程调试]' })"
    Write-Host ''
    Write-Host '安装到手机：' -ForegroundColor Gray
    Write-Host "  adb install -r `"$apk`"" -ForegroundColor Gray
    if ($Debug) {
        Write-Host '调试页面：手机连电脑后，Chrome 打开 chrome://inspect' -ForegroundColor Gray
    }
}
finally {
    Pop-Location
}
