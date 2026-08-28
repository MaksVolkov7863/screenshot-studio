"""Capture the Firefox window from actual screen pixels at physical DPI.

Do not PrintWindow GPU-composited Firefox (downscaled compositor cache).
Do not SW_RESTORE a maximized window (that shrinks it to a tiny restored size).
"""
from __future__ import annotations

import ctypes
import struct
import time
import zlib

# DPI must be set before wintypes/user32 geometry calls.
def _bootstrap_dpi() -> None:
    try:
        u = ctypes.WinDLL("user32", use_last_error=True)
        fn = getattr(u, "SetProcessDpiAwarenessContext", None)
        if fn and (fn(ctypes.c_void_p(-4)) or fn(ctypes.c_void_p(-3))):
            return
    except Exception:
        pass
    try:
        ctypes.WinDLL("shcore").SetProcessDpiAwareness(2)
        return
    except Exception:
        pass
    try:
        ctypes.WinDLL("user32").SetProcessDPIAware()
    except Exception:
        pass


_bootstrap_dpi()

from ctypes import wintypes  # noqa: E402

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32
dwmapi = ctypes.windll.dwmapi

user32.GetForegroundWindow.restype = wintypes.HWND
user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
user32.IsIconic.argtypes = [wintypes.HWND]
user32.IsZoomed.argtypes = [wintypes.HWND]
user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.GetDC.restype = wintypes.HDC
user32.ReleaseDC.argtypes = [wintypes.HWND, wintypes.HDC]

GWL_STYLE = -16
GWL_EXSTYLE = -20
WS_POPUP = 0x80000000
WS_EX_TOOLWINDOW = 0x00000080
SW_RESTORE = 9
SRCCOPY = 0x00CC0020
CAPTUREBLT = 0x40000000
DWMWA_EXTENDED_FRAME_BOUNDS = 9


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ("biSize", wintypes.DWORD),
        ("biWidth", wintypes.LONG),
        ("biHeight", wintypes.LONG),
        ("biPlanes", wintypes.WORD),
        ("biBitCount", wintypes.WORD),
        ("biCompression", wintypes.DWORD),
        ("biSizeImage", wintypes.DWORD),
        ("biXPelsPerMeter", wintypes.LONG),
        ("biYPelsPerMeter", wintypes.LONG),
        ("biClrUsed", wintypes.DWORD),
        ("biClrImportant", wintypes.DWORD),
    ]


class BITMAPINFO(ctypes.Structure):
    _fields_ = [("bmiHeader", BITMAPINFOHEADER), ("bmiColors", wintypes.DWORD * 3)]


WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


def _class_name(hwnd) -> str:
    buf = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, buf, 256)
    return buf.value


def _title(hwnd) -> str:
    buf = ctypes.create_unicode_buffer(512)
    user32.GetWindowTextW(hwnd, buf, 512)
    return buf.value


def _style(hwnd) -> int:
    return user32.GetWindowLongW(hwnd, GWL_STYLE) & 0xFFFFFFFF


def _exstyle(hwnd) -> int:
    return user32.GetWindowLongW(hwnd, GWL_EXSTYLE) & 0xFFFFFFFF


def _is_browser_frame(hwnd) -> bool:
    if not user32.IsWindowVisible(hwnd):
        return False
    if _class_name(hwnd) != "MozillaWindowClass":
        return False
    if _style(hwnd) & WS_POPUP:
        return False
    if _exstyle(hwnd) & WS_EX_TOOLWINDOW:
        return False
    if not _title(hwnd).strip():
        return False
    return True


def _win_size(hwnd):
    r = wintypes.RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(r)):
        return 0, 0
    return max(0, r.right - r.left), max(0, r.bottom - r.top)


def _enum_mozilla():
    found = []

    def cb(hwnd, _lparam):
        if _is_browser_frame(hwnd):
            w, h = _win_size(hwnd)
            found.append((w * h, w, h, hwnd))
        return True

    user32.EnumWindows(WNDENUMPROC(cb), 0)
    found.sort(key=lambda x: x[0], reverse=True)
    return found


def pick_hwnd():
    wins = _enum_mozilla()
    big = [x for x in wins if x[1] >= 500 and x[2] >= 300]
    if big:
        return big[0][3]
    return wins[0][3] if wins else user32.GetForegroundWindow()


def _client_box(hwnd):
    """Client area in physical screen pixels (process is per-monitor DPI v2)."""
    origin = wintypes.POINT(0, 0)
    user32.ClientToScreen(hwnd, ctypes.byref(origin))
    client = wintypes.RECT()
    user32.GetClientRect(hwnd, ctypes.byref(client))
    width, height = client.right - client.left, client.bottom - client.top
    if width >= 8 and height >= 8:
        return origin.x, origin.y, width, height
    ext = wintypes.RECT()
    if (
        dwmapi.DwmGetWindowAttribute(
            hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, ctypes.byref(ext), ctypes.sizeof(ext)
        )
        == 0
    ):
        return ext.left, ext.top, max(1, ext.right - ext.left), max(1, ext.bottom - ext.top)
    wnd = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(wnd))
    return wnd.left, wnd.top, max(1, wnd.right - wnd.left), max(1, wnd.bottom - wnd.top)


def _bgra_to_rgba(buf: bytes, n: int) -> bytearray:
    rgba = bytearray(buf[: n * 4])
    for i in range(0, len(rgba), 4):
        rgba[i], rgba[i + 2] = rgba[i + 2], rgba[i]
        rgba[i + 3] = 255
    return rgba


def _read_dib(hdc, hbmp, width, height) -> bytearray:
    bmi = BITMAPINFO()
    bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bmi.bmiHeader.biWidth = width
    bmi.bmiHeader.biHeight = -height
    bmi.bmiHeader.biPlanes = 1
    bmi.bmiHeader.biBitCount = 32
    bmi.bmiHeader.biCompression = 0
    raw = (ctypes.c_ubyte * (width * height * 4))()
    got = gdi32.GetDIBits(hdc, hbmp, 0, height, raw, ctypes.byref(bmi), 0)
    if got == 0:
        raise RuntimeError("GetDIBits failed")
    return _bgra_to_rgba(bytes(raw), width * height)


def _bitblt_screen(x: int, y: int, width: int, height: int) -> bytearray:
    hdc_screen = user32.GetDC(0)
    if not hdc_screen:
        raise RuntimeError("GetDC(0) failed")
    hdc_mem = gdi32.CreateCompatibleDC(hdc_screen)
    hbmp = gdi32.CreateCompatibleBitmap(hdc_screen, width, height)
    old = gdi32.SelectObject(hdc_mem, hbmp)
    try:
        ok = gdi32.BitBlt(
            hdc_mem, 0, 0, width, height, hdc_screen, x, y, SRCCOPY | CAPTUREBLT
        )
        if not ok:
            ok = gdi32.BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, x, y, SRCCOPY)
        if not ok:
            raise RuntimeError("BitBlt failed")
        gdi32.SelectObject(hdc_mem, old)
        old = None
        return _read_dib(hdc_screen, hbmp, width, height)
    finally:
        if old is not None:
            gdi32.SelectObject(hdc_mem, old)
        gdi32.DeleteObject(hbmp)
        gdi32.DeleteDC(hdc_mem)
        user32.ReleaseDC(0, hdc_screen)


def grab_hwnd(hwnd) -> bytes:
    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, SW_RESTORE)
        time.sleep(0.2)
    try:
        user32.SetForegroundWindow(hwnd)
    except Exception:
        pass

    x, y, width, height = _client_box(hwnd)
    if width < 8 or height < 8:
        raise RuntimeError("window too small")
    rgba = _bitblt_screen(x, y, width, height)
    return _png(width, height, rgba)


def _png(width: int, height: int, rgba: bytearray) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    raw = bytearray()
    stride = width * 4
    for row in range(height):
        raw.append(0)
        raw.extend(rgba[row * stride : (row + 1) * stride])
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 6))
        + chunk(b"IEND", b"")
    )


def capture_firefox_png() -> bytes:
    hwnd = pick_hwnd()
    if not hwnd:
        raise RuntimeError("Firefox window not found")
    return grab_hwnd(hwnd)


if __name__ == "__main__":
    import sys

    png = capture_firefox_png()
    out = sys.argv[1] if len(sys.argv) > 1 else "firefox-capture.png"
    with open(out, "wb") as f:
        f.write(png)
    print(f"wrote {out} ({len(png)} bytes)")
