"""Copy the page's half from the JavaScript library, which is where it is written.

    python scripts/sync_js.py [path/to/dials.js]

The Python package carries ``dials.js`` whole, as ``src/pydials/web/dials.js``, and the
examples carry the stand-in synth. Both are copies: change them in the JavaScript repository
(by default the folder ``dials.js`` beside this one) and run this. The tests fail while the
copies differ from it.
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COPIES = (
    ("dials.js", ROOT / "src" / "pydials" / "web" / "dials.js"),
    ("examples/standin-synth.js", ROOT / "examples" / "standin-synth.js"),
)


def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "dials.js"
    for name, to in COPIES:
        to.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / name, to)
        print("copied %s" % to.relative_to(ROOT))


if __name__ == "__main__":
    main()
