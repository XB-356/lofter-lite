<#
  编译桌面启动器（零依赖：用 Windows 自带的 C# 编译器，不需要装 .NET SDK / Visual Studio）

    powershell -ExecutionPolicy Bypass -File desktop\build.ps1
    powershell -ExecutionPolicy Bypass -File desktop\build.ps1 -Run     # 编译完顺便打开

  产物：desktop\LOFTER-Lite-Launcher.exe
#>
param([switch]$Run)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $PSScriptRoot 'src\Launcher.cs'
$out = Join-Path $PSScriptRoot 'LOFTER-Lite-Launcher.exe'

$candidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$csc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $csc) { throw "找不到 csc.exe（需要 .NET Framework 4.x，Windows 10/11 自带）" }
if (-not (Test-Path $src)) { throw "找不到源码: $src" }
if (-not (Test-Path (Join-Path $root 'server.js'))) { throw "这不是仓库根目录？找不到 server.js" }

Write-Host "编译 $src" -ForegroundColor Cyan
& $csc /nologo /target:winexe /optimize+ "/out:$out" `
  /reference:System.dll `
  /reference:System.Drawing.dll `
  /reference:System.Windows.Forms.dll `
  $src
if ($LASTEXITCODE -ne 0) { throw "编译失败（exit $LASTEXITCODE）" }

Write-Host "已生成 $out" -ForegroundColor Green
if ($Run) { Start-Process -FilePath $out }
