#!/usr/bin/env python3
"""Package the LaiTab tree for a later human submission. Does not publish or submit."""
from __future__ import annotations

import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT.parent / "artifacts"
SKIP_DIRS = {
    "node_modules",
    "dist",
    "dist-ssr",
    ".git",
    "__pycache__",
    ".venv",
    ".idea",
    ".vscode",
    "coverage",
}
SKIP_NAMES = {".env", ".DS_Store"}
SKIP_SUFFIXES = {".log", ".pyc", ".tsbuildinfo"}


def include(path: Path, rel: Path) -> bool:
    if any(part in SKIP_DIRS for part in rel.parts):
        return False
    if path.name in SKIP_NAMES:
        return False
    if path.name.startswith(".env") and path.name != ".env.example":
        return False
    if path.name.endswith(".local") or path.suffix in SKIP_SUFFIXES:
        return False
    return True


def iter_files(base: Path):
    found = []
    for path in base.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(base)
        if include(path, rel):
            found.append((path, rel.as_posix()))
    found.sort(key=lambda item: item[1])
    return found


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = OUT_DIR / f"laitab-src-{date.today().isoformat()}.zip"
    if zip_path.exists():
        zip_path.unlink()
    names = list(iter_files(ROOT))
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path, name in names:
            zf.write(path, arcname=name)
    print(
        f"wrote {zip_path} ({zip_path.stat().st_size} bytes, {len(names)} files). "
        "Source only; dist is built separately with npm run build. "
        "This zip is for a later public GitHub/lab repo. It does not include node_modules, dist, or .env."
    )


if __name__ == "__main__":
    main()
