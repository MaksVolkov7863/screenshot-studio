#!/usr/bin/env python3
"""Build unsigned Firefox extension zip and xpi into dist/."""
from __future__ import annotations

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"

SKIP_DIRS = {
    ".git",
    ".github",
    ".vscode",
    ".idea",
    "dist",
    "node_modules",
    "__pycache__",
}
SKIP_FILES = {
    ".gitignore",
    ".gitattributes",
    "pack.ps1",
}
SKIP_SUFFIX = {".pyc", ".pyo", ".zip", ".xpi", ".log"}


def should_skip(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    if any(part in SKIP_DIRS for part in rel.parts):
        return True
    if path.name in SKIP_FILES or path.name.startswith("."):
        return True
    if path.suffix.lower() in SKIP_SUFFIX:
        return True
    if path.name.startswith("_") and path.suffix.lower() in {".png", ".ps1"}:
        return True
    return False


def main() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    DIST.mkdir(exist_ok=True)
    base = f"screenshot-studio-{version}"
    zip_path = DIST / f"{base}.zip"
    xpi_path = DIST / f"{base}.xpi"

    files = [p for p in ROOT.rglob("*") if p.is_file() and not should_skip(p)]
    files.sort()
    if not files:
        raise SystemExit("no files to pack")

    for out in (zip_path, xpi_path):
        if out.exists():
            out.unlink()
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for p in files:
                zf.write(p, p.relative_to(ROOT).as_posix())
        print(f"wrote {out} ({out.stat().st_size} bytes, {len(files)} files)")


if __name__ == "__main__":
    main()
