#!/usr/bin/env python3
"""Firefox native messaging host → Windows.Media.Ocr."""
from __future__ import annotations

import json
import os
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
PS1 = os.path.join(HERE, "win-ocr.ps1")
CREATE_NO_WINDOW = 0x08000000


def read_msg():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    (n,) = struct.unpack("<I", raw)
    data = sys.stdin.buffer.read(n)
    return json.loads(data.decode("utf-8"))


def write_msg(obj):
    data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def ocr_path(path: str) -> str:
    r = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            PS1,
            "-Path",
            path,
        ],
        capture_output=True,
        creationflags=CREATE_NO_WINDOW,
    )
    out = r.stdout.decode("utf-8", errors="replace").strip()
    err = r.stderr.decode("utf-8", errors="replace").strip()
    if r.returncode != 0:
        raise RuntimeError(err or out or "Windows OCR failed")
    return out


def main():
    while True:
        msg = read_msg()
        if msg is None:
            return
        if msg.get("ping"):
            write_msg({"ok": True, "engine": "windows", "capture": True})
            continue
        if msg.get("action") == "capture" or msg.get("capture"):
            try:
                import base64
                from win_capture import capture_firefox_png

                png = capture_firefox_png()
                write_msg(
                    {
                        "ok": True,
                        "dataUrl": "data:image/png;base64," + base64.b64encode(png).decode("ascii"),
                    }
                )
            except Exception as e:
                try:
                    import base64
                    import tempfile

                    fd, path = tempfile.mkstemp(suffix=".png")
                    os.close(fd)
                    r = subprocess.run(
                        [
                            "powershell.exe",
                            "-NoProfile",
                            "-ExecutionPolicy",
                            "Bypass",
                            "-File",
                            os.path.join(HERE, "win-capture.ps1"),
                            "-OutFile",
                            path,
                        ],
                        capture_output=True,
                        creationflags=CREATE_NO_WINDOW,
                    )
                    if r.returncode != 0:
                        raise RuntimeError(
                            (r.stderr or r.stdout).decode("utf-8", "replace") or str(e)
                        )
                    with open(path, "rb") as f:
                        png = f.read()
                    os.remove(path)
                    write_msg(
                        {
                            "ok": True,
                            "dataUrl": "data:image/png;base64,"
                            + base64.b64encode(png).decode("ascii"),
                        }
                    )
                except Exception as e2:
                    write_msg({"ok": False, "error": str(e2)})
            continue
        data_url = msg.get("image") or ""
        if not data_url:
            write_msg({"ok": False, "error": "no image"})
            continue
        try:
            import base64

            if "," in data_url:
                data_url = data_url.split(",", 1)[1]
            raw = base64.b64decode(data_url)
            fd, path = tempfile.mkstemp(suffix=".png")
            os.close(fd)
            try:
                with open(path, "wb") as f:
                    f.write(raw)
                text = ocr_path(path)
            finally:
                try:
                    os.remove(path)
                except OSError:
                    pass
            write_msg({"ok": True, "text": text, "engine": "windows"})
        except Exception as e:
            write_msg({"ok": False, "error": str(e)})


if __name__ == "__main__":
    main()
