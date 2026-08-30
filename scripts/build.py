from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "web"
OUTPUT = ROOT / "dist"


def build(source: Path = SOURCE, output: Path = OUTPUT) -> Path:
    if not source.is_dir():
        raise FileNotFoundError(f"Static source directory does not exist: {source}")

    if output.exists():
        shutil.rmtree(output)

    shutil.copytree(source, output)
    return output


if __name__ == "__main__":
    built = build()
    files = sum(1 for path in built.rglob("*") if path.is_file())
    print(f"Built {files} static files in {built}")
