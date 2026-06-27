"""Loads the JSON design data into memory (single source of truth)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def _load(rel):
    return json.loads((DATA / rel).read_text())


classes = _load("classes.json")
geas_instructions = _load("geas_instructions.json")
affixes = _load("affixes.json")
sigils = {s["id"]: s for s in _load("sigils.json")["sigils"]}
geaswords = _load("geaswords.json")["geaswords"]
monsters = _load("monsters.json")
skills = {p.stem: _load("skills/" + p.name) for p in sorted((DATA / "skills").glob("*.json"))}

_scroll_dir = DATA / "geas_scrolls"
scrolls = ({p.stem: _load("geas_scrolls/" + p.name) for p in sorted(_scroll_dir.glob("*.json"))}
           if _scroll_dir.exists() else {})
