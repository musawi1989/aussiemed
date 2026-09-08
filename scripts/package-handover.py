"""Build a source handover without relying on Git status or filename substrings.

Run from any directory: python scripts/package-handover.py
Only explicitly selected source/content roots are visited. Private runtime data,
dependencies, generated clients and build caches are never archive candidates.
"""
from pathlib import Path
import hashlib
import json
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
ROOT_FILES = (
    ".env.example", ".gitattributes", ".gitignore", "AGENTS.md", "README.md",
    "next.config.ts", "package.json", "package-lock.json", "postcss.config.mjs",
    "prisma.config.ts", "tsconfig.json",
)
SOURCE_ROOTS = ("src", "prisma", "scripts", "docs", "extraction/data")
PUBLIC_ROOTS = ("brand", "categories", "flags", "fonts", "products")
PUBLIC_FILES = ("entity-placeholder.svg", "product-placeholder.svg")


def excluded(relative):
    parts = relative.parts
    if relative.as_posix().startswith("src/generated/"):
        return True
    if any(part in ("__pycache__", "node_modules", ".next", ".git") for part in parts):
        return True
    # Match actual file extensions. In particular, 'logo' is NOT a log file.
    return relative.suffix.lower() in (".log", ".db", ".pyc", ".pem", ".key") or relative.name == ".env"


def collect(root):
    files = {}
    for name in ROOT_FILES:
        files[name] = (root / name).read_bytes()
    for folder in (*SOURCE_ROOTS, *(f"public/{name}" for name in PUBLIC_ROOTS)):
        for path in sorted((root / folder).rglob("*")):
            if path.is_file():
                relative = path.relative_to(root)
                if not excluded(relative):
                    if path.is_symlink():
                        raise ValueError(f"Unexpected source symlink: {relative}")
                    files[relative.as_posix()] = path.read_bytes()
    for name in PUBLIC_FILES:
        files[f"public/{name}"] = (root / "public" / name).read_bytes()
    for path in sorted((root / "public/uploads/products").glob("*")):
        if path.is_file() and path.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg") and not path.name.startswith("logo-"):
            files[path.relative_to(root).as_posix()] = path.read_bytes()
    # next dev/build will regenerate this file for the recipient's own cache.
    files["next-env.d.ts"] = (
        '/// <reference types="next" />\n'
        '/// <reference types="next/image-types/global" />\n'
        '// Next.js regenerates local route references on startup.\n'
    ).encode()
    instructions = root / "handover/START-HERE.md"
    if not instructions.is_file():
        instructions = root / "START-HERE.md"
    files["START-HERE.md"] = instructions.read_bytes()
    return files


def verify_source_coverage(root, files):
    # Independently compare every application source and migration to the ZIP
    # candidates, rather than assuming a self-consistent manifest is complete.
    for folder in ("src", "prisma"):
        for path in (root / folder).rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(root)
            if relative.as_posix().startswith("src/generated/"):
                continue
            if path.suffix.lower() in (".ts", ".tsx", ".mjs", ".js", ".json", ".css", ".prisma", ".sql", ".toml"):
                if files.get(relative.as_posix()) != path.read_bytes():
                    raise ValueError(f"Missing or changed source file: {relative}")
    for required in ("src/lib/logo-actions.ts", "src/lib/logo-access.ts", "src/lib/logo-access.test.ts"):
        if required not in files:
            raise ValueError(f"Missing required logo module: {required}")


def write_archive(destination, files):
    manifest = [dict(path=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
                for name, data in sorted(files.items())]
    files = dict(files)
    files["FILE-MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED, compresslevel=7) as archive:
        for name, data in sorted(files.items()):
            archive.writestr("AussieMed/" + name, data)
    with zipfile.ZipFile(destination) as archive:
        if archive.testzip() is not None:
            raise ValueError("ZIP integrity check failed")
        if len(archive.namelist()) != len(files):
            raise ValueError("ZIP entry count does not match the source manifest")
        for name, data in files.items():
            if archive.read("AussieMed/" + name) != data:
                raise ValueError(f"ZIP contents differ: {name}")
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.with_suffix(destination.suffix + ".sha256").write_text(
        f"{digest}  {destination.name}\n", encoding="utf-8")
    return len(files), digest


def main():
    destination = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "handover/AussieMed-Website-Handover-2026-09-08-FIXED.zip"
    files = collect(ROOT)
    verify_source_coverage(ROOT, files)
    count, digest = write_archive(destination, files)
    print(json.dumps(dict(archive=str(destination), files=count,
                         bytes=destination.stat().st_size, sha256=digest), indent=2))


if __name__ == "__main__":
    main()
