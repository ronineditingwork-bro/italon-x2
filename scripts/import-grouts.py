#!/usr/bin/env python3
"""Таблица затирок Italon (xlsx, лист «Рекомендации 2025») → data/italon-grouts-2025.json.

  python3 scripts/import-grouts.py Italon_затирки_Mapei_Litokol_2025.xlsx

Правки вносятся в xlsx, затем этот скрипт и пересборка сайта. Каталог 2021 года не импортируется (решение владельца).
check_litokol=1 — аналог Litokol спорный или без названия цвета: на сайте показывается только Mapei.
"""
import json, sys
from pathlib import Path
from openpyxl import load_workbook

rows = list(load_workbook(sys.argv[1], read_only=True, data_only=True)['Рекомендации 2025'].iter_rows(values_only=True))
head = [str(h) for h in rows[0]]
keys = ['collection', 'collection_ru', 'use', 'article_ru', 'article_en', 'mapei', 'mapei2', 'litokol', 'check_litokol', 'note']
out = []
for r in rows[1:]:
    d = dict(zip(head, r))
    if not d.get('Коллекция'): continue
    note = str(d.get('Проверить') or '')
    cell = lambda k: str(d.get(k) if d.get(k) is not None else '').strip()
    line = [cell('Коллекция'), cell('Коллекция (RU)'), cell('Назначение'), cell('Артикул (RU)'), cell('Article (EN)'), cell('Mapei, цвет'),
            cell('Mapei, вариант 2'), cell('Litokol'), '1' if 'Litokol' in note else '', note]
    assert line[5].isdigit(), line                      # цвет Mapei обязателен
    out.append({k: v for k, v in zip(keys, line) if v})
dest = Path(__file__).resolve().parents[1] / 'data/italon-grouts-2025.json'
dest.write_text(json.dumps(out, ensure_ascii=False, indent=0) + '\n', encoding='utf-8')
print(len(out), 'строк →', dest)
