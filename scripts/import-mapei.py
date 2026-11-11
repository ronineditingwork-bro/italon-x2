#!/usr/bin/env python3
"""Прайс Mapei поставщика (выгрузка YML/XML: catalog_export_*.xml) → data/mapei-price.json и фото в public/media/mapei/.

  python3 scripts/import-mapei.py catalog_export_11-11-2026.xml

Берутся затирки Ultracolor Plus (цементная), Kerapoxy и Kerapoxy Easy Design (эпоксидные) и клеи — их рекомендует сайт. Склад — Краснодар, на дату выгрузки.
Фото скачиваются с сайта поставщика (адрес — из выгрузки) и сжимаются до 400 px в WebP на белом фоне.
"""
import io, json, re, subprocess, sys
from datetime import date
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
xml = Path(sys.argv[1]).read_text(encoding='utf-8')
base = (re.search(r'<url>(https?://[^<]+)</url>', xml) or [None, ''])[1].rstrip('/')
stamp = (re.search(r'<yml_catalog date="(\d{4}-\d\d-\d\d)', xml) or [None, str(date.today())])[1]
media = root / 'public/media/mapei'; media.mkdir(parents=True, exist_ok=True)
items = {}
for offer in re.findall(r'<offer id="\d+">(.*?)</offer>', xml, re.S):
    tag = lambda t: (re.search(f'<{t}>(.*?)</{t}>', offer, re.S) or [None, ''])[1].strip()
    name, sku = tag('name'), tag('articul')
    if not re.search(r'ULTRACOLOR PLUS \d{3}|KERAPOXY EASY DESIGN №\d|КЕРАПОКСИ №\d|клей', name): continue   # цементная и эпоксидная затирка, клеи
    kg = re.search(r'\((\d+(?:[.,]\d+)?)\s*кг\)', name)
    item = {'name': name, 'price': round(float(tag('price'))), 'stock': int(float(tag('quantity') or 0)), 'kg': float(kg[1].replace(',', '.')) if kg else None}
    pics = re.findall(r'<picture>(.*?)</picture>', offer)
    if pics:
        out = media / f"{re.sub(r'[^0-9A-Za-z]', '_', sku)}.webp"
        if not out.exists():
            raw = subprocess.run(['curl', '-fsS', '--retry', '3', base + pics[-1]], capture_output=True, check=True).stdout   # pics[-1] — оригинал, первая — уменьшенная копия
            im = Image.open(io.BytesIO(raw)).convert('RGBA'); im = Image.alpha_composite(Image.new('RGBA', im.size, 'white'), im).convert('RGB')
            im.thumbnail((400, 400)); im.save(out, 'WEBP', quality=82)
        item['image'] = '/media/mapei/' + out.name
    items[sku] = item
assert items, 'в выгрузке нет затирок Ultracolor Plus и клеёв'
dest = root / 'data/mapei-price.json'
dest.write_text(json.dumps({'source': f'Прайс Mapei поставщика, склад Краснодар, выгрузка {stamp}', 'date': stamp, 'items': items}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(len(items), 'позиций →', dest)
