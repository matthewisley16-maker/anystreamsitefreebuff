param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$ResDir
)

Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile($Source)
$sizes = @{
    "mipmap-mdpi"    = 48
    "mipmap-hdpi"    = 72
    "mipmap-xhdpi"   = 96
    "mipmap-xxhdpi"  = 144
    "mipmap-xxxhdpi" = 192
}

foreach ($key in $sizes.Keys) {
    $dir = Join-Path $ResDir $key
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $size = $sizes[$key]
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($img, 0, 0, $size, $size)
    $g.Dispose()
    $bmp.Save((Join-Path $dir "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

# Android TV needs a 320x180 banner for the leanback launcher.
$bannerDir = Join-Path $ResDir "drawable-xhdpi"
New-Item -ItemType Directory -Force -Path $bannerDir | Out-Null
$banner = New-Object System.Drawing.Bitmap -ArgumentList 320, 180
$bg = [System.Drawing.Graphics]::FromImage($banner)
$bg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$bg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$bg.Clear([System.Drawing.Color]::FromArgb(10, 10, 12))
$glow = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(38, 229, 9, 20))
$bg.FillEllipse($glow, -40, 20, 250, 170)
$bg.DrawImage($img, 26, 50, 80, 80)
$titleFont = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 21, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$titleBrush = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::White)
$bg.DrawString("anystreamsite", $titleFont, $titleBrush, 120, 70)
$tagFont = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 12, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$tagBrush = New-Object System.Drawing.SolidBrush -ArgumentList ([System.Drawing.Color]::FromArgb(150, 255, 255, 255))
$bg.DrawString("one window", $tagFont, $tagBrush, 122, 99)
$bg.Dispose()
$banner.Save((Join-Path $bannerDir "tv_banner.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$banner.Dispose()
$img.Dispose()

Write-Output "art: launcher icons and tv banner generated"
