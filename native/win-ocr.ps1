# Windows.Media.Ocr (Win10/11). Usage: powershell -STA -File win-ocr.ps1 -Path C:\shot.png
param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
        $_.Name -eq "AsTask" -and
        $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1"
    } |
    Select-Object -First 1

if (-not $asTaskGeneric) { throw "AsTask not found. Need Windows 10/11 and PowerShell 5+." }

function Await-WinRT($WinRtTask, [Type]$ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $null = $netTask.Wait(-1)
    return $netTask.Result
}

$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) {
    foreach ($tag in @("ru", "ru-RU", "en", "en-US")) {
        try {
            $lang = [Windows.Globalization.Language]::new($tag)
            if ([Windows.Media.Ocr.OcrEngine]::IsLanguageSupported($lang)) {
                $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
                if ($engine) { break }
            }
        } catch { }
    }
}
if (-not $engine) { throw "Windows OCR is unavailable. Install an OCR language pack in Windows Settings." }

$full = [System.IO.Path]::GetFullPath($Path)
$file = Await-WinRT ([Windows.Storage.StorageFile]::GetFileFromPathAsync($full)) ([Windows.Storage.StorageFile])
$stream = Await-WinRT ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
    $decoder = Await-WinRT ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await-WinRT ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    if ($bitmap.BitmapPixelFormat -ne [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8 -or
        $bitmap.BitmapAlphaMode -ne [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied) {
        $bitmap = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert(
            $bitmap,
            [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
            [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied
        )
    }
    $result = Await-WinRT ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $text = $result.Text
    if (-not $text) {
        $lines = New-Object System.Collections.Generic.List[string]
        foreach ($line in $result.Lines) { [void]$lines.Add($line.Text) }
        $nl = [char]10
        $text = [string]::Join([string]$nl, $lines)
    }
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
    [Console]::Out.Write($text)
} finally {
    $stream.Dispose()
}
