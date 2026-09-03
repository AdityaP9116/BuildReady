from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHECKED_SUFFIXES = {".css", ".html", ".js", ".json", ".md", ".mjs", ".py", ".toml", ".yml"}
IGNORED_PARTS = {".git", ".runtime", ".venv", "dist", "node_modules"}
IGNORED_FILES = {".devpost-hackathon-state.json"}


def checked_files() -> list[Path]:
    return sorted(
        path
        for path in ROOT.rglob("*")
        if path.is_file()
        and path.suffix in CHECKED_SUFFIXES
        and not IGNORED_PARTS.intersection(path.parts)
        and path.name not in IGNORED_FILES
    )


def main() -> None:
    problems: list[str] = []

    for path in checked_files():
        text = path.read_text(encoding="utf-8")
        relative = path.relative_to(ROOT)

        if "\r" in text:
            problems.append(f"{relative}: use LF line endings")
        if not text.endswith("\n"):
            problems.append(f"{relative}: missing newline at EOF")
        if text.endswith("\n\n"):
            problems.append(f"{relative}: extra blank line at EOF")

        for number, line in enumerate(text.splitlines(), start=1):
            if line.rstrip() != line:
                problems.append(f"{relative}:{number}: trailing whitespace")

    required = [
        ROOT / "web" / "index.html",
        ROOT / "web" / "app.js",
        ROOT / "web" / "styles.css",
        ROOT / "web" / "_redirects",
    ]
    problems.extend(f"{path.relative_to(ROOT)}: required file missing" for path in required if not path.is_file())

    if problems:
        raise SystemExit("\n".join(problems))

    print(f"Checked {len(checked_files())} project files")
    subprocess.run(
        [
            "node",
            "--test",
            str(ROOT / "tests" / "js" / "onshape-function-contract.mjs"),
            str(ROOT / "tests" / "js" / "fea-validation.mjs"),
            str(ROOT / "tests" / "js" / "source-foundation.mjs"),
            str(ROOT / "tests" / "js" / "fea-state-foundation.mjs"),
        ],
        cwd=ROOT,
        check=True,
    )
    for script in ("app.js", "webmcp.js", "fea-state.js", "fea-client.js", "fea-validation.js", "sourcing.js", "live-demo.js", "manufacturing-review.js"):
        subprocess.run(["node", "--check", str(ROOT / "web" / script)], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
