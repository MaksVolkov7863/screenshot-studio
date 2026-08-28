"""Capture the Firefox window via GDI (works on about:, AMO, PDF)."""
from __future__ import annotations

import ctypes
import struct
import zlib
from ctypes import wintypes

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32

user32.SetProcessDPIAware.argtypes = []
user32.GetForegroundWindow.restype = wintypes.HWND
user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
user32.IsWindowVisible.argtypes = [wintypes.HWND]
user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]


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


def _area(hwnd) -> int:
    r = wintypes.RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(r)):
        return 0
    return max(0, r.right - r.left) * max(0, r.bottom - r.top)


def _enum_mozilla():
    found = []

    def cb(hwnd, _lparam):
        if user32.IsWindowVisible(hwnd) and _class_name(hwnd) == "MozillaWindowClass":
            found.append((_area(hwnd), hwnd))
        return True

    user32.EnumWindows(WNDENUMPROC(cb), 0)
    found.sort(key=lambda x: x[0], reverse=True)
    return found


def pick_hwnd():
    try:
        user32.SetProcessDPIAware()
    except Exception:
        pass
    wins = _enum_mozilla()
    big = [(a, h) for a, h in wins if a >= 600 * 400]
    if big:
        return big[0][1]
    return wins[0][1] if wins else user32.GetForegroundWindow()


def grab_hwnd(hwnd) -> bytes:
    client = wintypes.RECT()
    user32.GetClientRect(hwnd, ctypes.byref(client))
    pt = wintypes.POINT(0, 0)
    user32.ClientToScreen(hwnd, ctypes.byref(pt))
    width = client.right - client.left
    height = client.bottom - client.top
    if width < 8 or height < 8:
        raise RuntimeError("window too small")

    hdc_screen = user32.GetDC(0)
    hdc_mem = gdi32.CreateCompatibleDC(hdc_screen)
    hbmp = gdi32.CreateCompatibleBitmap(hdc_screen, width, height)
    old = gdi32.SelectObject(hdc_mem, hbmp)
    SRCCOPY = 0x00CC0020
    gdi32.BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, pt.x, pt.y, SRCCOPY)

    bmi = BITMAPINFO()
    bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bmi.bmiHeader.biWidth = width
    bmi.bmiHeader.biHeight = -height
    bmi.bmiHeader.biPlanes = 1
    bmi.bmiHeader.biBitCount = 32
    bmi.bmiHeader.biCompression = 0
    buf = (ctypes.c_ubyte * (width * height * 4))()
    gdi32.GetDIBits(hdc_screen, hbmp, 0, height, buf, ctypes.byref(bmi), 0)

    gdi32.SelectObject(hdc_mem, old)
    gdi32.DeleteObject(hbmp)
    gdi32.DeleteDC(hdc_mem)
    user32.ReleaseDC(0, hdc_screen)

    rgba = bytearray(width * height * 4)
    src = bytes(buf)
    for i in range(0, len(src), 4):
        rgba[i] = src[i + 2]
        rgba[i + 1] = src[i + 1]
        rgba[i + 2] = src[i]
        rgba[i + 3] = 255
    return _png(width, height, rgba)


def _png(width: int, height: int, rgba: bytearray) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * stride : (y + 1) * stride])
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
