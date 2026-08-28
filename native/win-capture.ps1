# Capture Firefox client area to a PNG path. Usage: win-capture.ps1 -OutFile C:\t.png
param(
    [Parameter(Mandatory = $true)]
    [string]$OutFile
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class FxCap {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder n, int max);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool LogicalToPhysicalPointForPerMonitorDPI(IntPtr hWnd, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public struct POINT { public int X, Y; }
}
"@
try {
  Add-Type @"
using System.Runtime.InteropServices;
public class DpiA {
  [DllImport("Shcore.dll")] public static extern int SetProcessDpiAwareness(int v);
}
"@
  [DpiA]::SetProcessDpiAwareness(2) | Out-Null
} catch {
  [FxCap]::SetProcessDPIAware() | Out-Null
}

function Get-Class([IntPtr]$h) {
    $sb = New-Object System.Text.StringBuilder 256
    [void][FxCap]::GetClassName($h, $sb, 256)
    return $sb.ToString()
}
function Get-Area([IntPtr]$h) {
    $r = New-Object FxCap+RECT
    [void][FxCap]::GetWindowRect($h, [ref]$r)
    return [Math]::Max(0, $r.Right - $r.Left) * [Math]::Max(0, $r.Bottom - $r.Top)
}

$script:best = [IntPtr]::Zero
$script:bestArea = 0
$cb = [FxCap+EnumProc] {
    param([IntPtr]$h, [IntPtr]$lp)
    if ([FxCap]::IsWindowVisible($h) -and (Get-Class $h) -eq "MozillaWindowClass") {
        $a = Get-Area $h
        if ($a -gt $script:bestArea) { $script:bestArea = $a; $script:best = $h }
    }
    return $true
}
[void][FxCap]::EnumWindows($cb, [IntPtr]::Zero)
$hwnd = $script:best
if ($script:bestArea -lt (600 * 400)) {
    $fg = [FxCap]::GetForegroundWindow()
    if ((Get-Class $fg) -eq "MozillaWindowClass") { $hwnd = $fg }
}
if ($hwnd -eq [IntPtr]::Zero) { throw "Firefox window not found" }

[void][FxCap]::ShowWindow($hwnd, 9)
[void][FxCap]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 120

$rc = New-Object FxCap+RECT
[void][FxCap]::GetClientRect($hwnd, [ref]$rc)
$pt = New-Object FxCap+POINT
$pt.X = 0; $pt.Y = 0
[void][FxCap]::ClientToScreen($hwnd, [ref]$pt)
try { [void][FxCap]::LogicalToPhysicalPointForPerMonitorDPI($hwnd, [ref]$pt) } catch {}
$br = New-Object FxCap+POINT
$br.X = $rc.Right; $br.Y = $rc.Bottom
[void][FxCap]::ClientToScreen($hwnd, [ref]$br)
try { [void][FxCap]::LogicalToPhysicalPointForPerMonitorDPI($hwnd, [ref]$br) } catch {}
$w = $br.X - $pt.X
$h = $br.Y - $pt.Y
if ($w -lt 8 -or $h -lt 8) { throw "window too small" }

$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($pt.X, $pt.Y, 0, 0, (New-Object System.Drawing.Size $w, $h))
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
