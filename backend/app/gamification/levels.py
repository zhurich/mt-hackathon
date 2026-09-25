from functools import lru_cache

from app.content import CONTENT_DIR, read_yaml


@lru_cache
def levels() -> list[dict]:
    return sorted(read_yaml(CONTENT_DIR / "levels.yaml"), key=lambda level: level["xp"])


def level_info(xp: int) -> dict:
    table = levels()
    index = max(i for i, level in enumerate(table) if xp >= level["xp"])
    current = table[index]
    following = table[index + 1] if index + 1 < len(table) else None
    progress = 1.0
    if following:
        progress = (xp - current["xp"]) / (following["xp"] - current["xp"])
    return {
        "index": index,
        "title": current["title"],
        "xp": xp,
        "level_xp": current["xp"],
        "next_xp": following["xp"] if following else None,
        "next_title": following["title"] if following else None,
        "progress": round(progress, 3),
    }
