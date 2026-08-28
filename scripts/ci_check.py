#!/usr/bin/env python3
"""Validate extension files for CI."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    manifest_path = ROOT / "manifest.json"
    if not manifest_path.is_file():
        fail("manifest.json missing")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        fail(f"manifest.json is not valid JSON: {e}")

    for key in ("manifest_version", "name", "version", "browser_specific_settings"):
        if key not in manifest:
            fail(f"manifest.json missing '{key}'")
    if manifest.get("manifest_version") != 3:
        fail("manifest_version must be 3")
    gecko = (manifest.get("browser_specific_settings") or {}).get("gecko") or {}
    if not gecko.get("id"):
        fail("gecko.id is required")

    for loc in ("ru", "en"):
        p = ROOT / "_locales" / loc / "messages.json"
        if not p.is_file():
            fail(f"missing {p.relative_to(ROOT)}")
        json.loads(p.read_text(encoding="utf-8"))

    required = [
        "background.js",
        "capture/overlay.js",
        "editor/editor.html",
        "editor/app.js",
        "editor/engine.js",
        "popup/popup.html",
        "icons/icon-48.png",
        "icons/icon-128.png",
    ]
    for rel in required:
        if not (ROOT / rel).is_file():
            fail(f"missing {rel}")

    js_files = list(ROOT.rglob("*.js"))
    skip = {".git", "dist", "__pycache__", "node_modules", "vendor"}
    js_files = [p for p in js_files if not any(part in skip for part in p.parts)]
    node = subprocess.run(["node", "-e", "process.exit(0)"], capture_output=True)
    if node.returncode != 0:
        fail("node is required for syntax checks")
    for p in js_files:
        r = subprocess.run(["node", "--check", str(p)], capture_output=True, text=True)
        if r.returncode != 0:
            fail(f"syntax error in {p.relative_to(ROOT)}:\n{r.stderr}")

    py_files = [
        ROOT / "scripts" / "pack.py",
        ROOT / "scripts" / "generate_icons.py",
        ROOT / "native" / "ocr-host.py",
        ROOT / "native" / "win_capture.py",
    ]
    for p in py_files:
        if not p.is_file():
            continue
        r = subprocess.run([sys.executable, "-m", "py_compile", str(p)], capture_output=True, text=True)
        if r.returncode != 0:
            fail(f"python compile failed {p.relative_to(ROOT)}:\n{r.stderr}")

    print(f"OK: version {manifest['version']}, {len(js_files)} JS files checked")


if __name__ == "__main__":
    main()
