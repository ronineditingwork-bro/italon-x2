"""Sanjet stock (Krasnodar, Moscow) -> stock.json {art: {krd, msk}} for the Whitecross app.

The XLS files are public links from the Sanjet cabinet, so no login is needed.
Values: 1, 2, '>3' (Sanjet: «Больше трех») or 0 (Sanjet: «Под заказ»).
Usage: python3 tools/stock.py stock.json            (downloads)
       python3 tools/stock.py stock.json krd.xls msk.xls   (local files, for testing)
"""
import json, sys, urllib.request
import xlrd  # pip install xlrd==2.0.1 (reads old .xls)

URL = 'https://sanjet.ru/sanjet_{}%20XLS.xls'
WAREHOUSES = ['krd', 'msk']


def level(v):
    if isinstance(v, float):
        return int(v)
    return '>3' if str(v).strip() == 'Больше трех' else 0


def read(data):
    sheet = xlrd.open_workbook(file_contents=data).sheet_by_index(0)
    head = [str(v).strip() for v in sheet.row_values(9)]
    assert head[3] == 'Артикул' and head[8] == 'Доступность', f'Sanjet changed the file layout: {head}'
    return {str(sheet.cell_value(r, 3)).strip(): level(sheet.cell_value(r, 8))
            for r in range(10, sheet.nrows)
            if str(sheet.cell_value(r, 0)).strip() == 'WHITECROSS' and str(sheet.cell_value(r, 3)).strip()}


if __name__ == '__main__':
    assert level(2.0) == 2 and level('Больше трех') == '>3' and level('Под заказ') == 0
    out, files = sys.argv[1], sys.argv[2:]
    stock = {}
    for i, w in enumerate(WAREHOUSES):
        if files:
            data = open(files[i], 'rb').read()
        else:
            with urllib.request.urlopen(URL.format(w), timeout=120) as r:
                data = r.read()
        for art, v in read(data).items():
            stock.setdefault(art, {'krd': 0, 'msk': 0})[w] = v
    assert len(stock) > 500, f'only {len(stock)} WHITECROSS rows: refusing to publish'
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(stock, f, ensure_ascii=False, separators=(',', ':'))
    print(len(stock), 'articles')
