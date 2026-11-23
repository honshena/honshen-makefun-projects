from pathlib import Path


OUTPUT_DIR = Path("/output")
JOKE = (
    "My AI coding agent fixed the demo crash by deleting the demo; "
    "the changelog calls it a 100% reduction in incidents."
)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "entry.txt").write_text(JOKE, encoding="utf-8")


if __name__ == "__main__":
    main()
