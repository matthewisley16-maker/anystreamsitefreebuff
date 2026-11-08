# Creates the anystreamsite desktop shortcut.
# Prefers the Electron app; falls back to a chromeless browser window if
# Electron has not been installed yet.

param(
  [string]$ShortcutName = "anystreamsite"
)

$ErrorActionPreference = "Stop"

$root        = Split-Path $PSScriptRoot -Parent
$appHtml     = Join-Path $root "index.html"
$electronExe = Join-Path $root "node_modules\electron\dist\electron.exe"

if (-not (Test-Path $appHtml)) { throw "index.html not found in $root" }

# 1. Draw the app icon (red rounded square + white play triangle)
Add-Type -AssemblyName System.Drawing

$icoPath = Join-Path $root "anystream.ico"
$size = 256
$bmp  = New-Object System.Drawing.Bitmap($size, $size)
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(255, 8, 8, 10))

$red   = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 229, 9, 20))
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

$r = 58; $x = 26; $y = 26; $w = $size - 52; $h = $size - 52
$rounded = New-Object System.Drawing.Drawing2D.GraphicsPath
$rounded.AddArc($x, $y, $r, $r, 180, 90)
$rounded.AddArc($x + $w - $r, $y, $r, $r, 270, 90)
$rounded.AddArc($x + $w - $r, $y + $h - $r, $r, $r, 0, 90)
$rounded.AddArc($x, $y + $h - $r, $r, $r, 90, 90)
$rounded.CloseFigure()
$g.FillPath($red, $rounded)

$triangle = [System.Drawing.PointF[]]@(
  (New-Object System.Drawing.PointF(108, 86)),
  (New-Object System.Drawing.PointF(184, 128)),
  (New-Object System.Drawing.PointF(108, 170))
)
$g.FillPolygon($white, $triangle)
$g.Dispose()

$pngPath = Join-Path $root "anystream-icon.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# 2. Package the PNG into a single-image .ico (PNG-compressed 256px entry)
$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$stream = [System.IO.File]::Create($icoPath)
$writer = New-Object System.IO.BinaryWriter($stream)
$writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]1)
$writer.Write([Byte]0); $writer.Write([Byte]0); $writer.Write([Byte]0); $writer.Write([Byte]0)
$writer.Write([UInt16]1); $writer.Write([UInt16]32)
$writer.Write([UInt32]$pngBytes.Length); $writer.Write([UInt32]22)
$writer.Write($pngBytes)
$writer.Close(); $stream.Close()

# 3. Point the shortcut at Electron if it is installed, else at the browser
$browserCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)

if (Test-Path $electronExe) {
  $target    = $electronExe
  $arguments = '"' + $root + '"'
  $mode      = "electron"
} else {
  $browser = $browserCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $browser) { throw "Neither Electron nor Chrome/Edge was found." }
  $target    = $browser
  $arguments = '--app="file:///' + ($appHtml -replace '\\', '/') + '"'
  $mode      = "browser"
}

$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "$ShortcutName.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath       = $target
$shortcut.Arguments        = $arguments
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation     = "$icoPath,0"
$shortcut.Description      = "anystreamsite - all your streaming sites in one window"
$shortcut.Save()

# 4. Remove the pre-rename shortcut so there is only one entry
$legacy = Join-Path $desktop "AnyStream.lnk"
if ($ShortcutName -ne "AnyStream" -and (Test-Path $legacy)) {
  Remove-Item $legacy -Force
  Write-Output "REMOVED  : $legacy"
}

Write-Output "MODE     : $mode"
Write-Output "TARGET   : $target"
Write-Output "ARGS     : $arguments"
Write-Output "SHORTCUT : $lnkPath"
Write-Output "EXISTS   : $(Test-Path $lnkPath)"
