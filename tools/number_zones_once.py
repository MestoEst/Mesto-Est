import argparse
import copy
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from main.spot_identity import validate_geojson


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Записать изменения в GeoJSON",
    )
    args = parser.parse_args()

    path = ROOT / "main" / "data" / "spots.geojson"
    original_bytes = path.read_bytes()
    original = json.loads(original_bytes.decode("utf-8"))
    updated = copy.deepcopy(original)

    for zone in updated["zones"]:
        match = re.fullmatch(r"z([1-9]\d*)", zone["id"])

        if match is None:
            raise ValueError(
                f"Нужен явный номер для зоны {zone['id']!r}"
            )

        number = int(match.group(1))
        zone["display_number"] = number
        zone["name"] = f"Зона {number}"


    validate_geojson(updated)


    if updated["features"] != original["features"]:
        raise RuntimeError("Обнаружено изменение парковочных мест")

    changed = [
        (old, new)
        for old, new in zip(original["zones"], updated["zones"])
        if old != new
    ]

    for old, new in changed:
        print(
            f"{old['id']}: "
            f"{old['name']} ({old['display_number']}) -> "
            f"{new['name']} ({new['display_number']})"
        )

    print(f"Зон с изменениями: {len(changed)}")

    if not args.apply:
        print("Проверка завершена. Файл не изменён.")
        return

    if not changed:
        print("Все номера уже назначены. Запись не требуется.")
        return

    backup = path.with_name(
        "spots.geojson.before-global-zones"
    )

    with backup.open("xb") as file:
        file.write(original_bytes)

    text = json.dumps(
        updated,
        ensure_ascii=False,
        indent=2,
    ) + "\n"

    path.write_text(text, encoding="utf-8")

    print(f"Сохранено: {path}")
    print(f"Исходная копия: {backup}")


if __name__ == "__main__":
    main()