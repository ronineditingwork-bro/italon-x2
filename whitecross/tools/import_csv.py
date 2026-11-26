"""Bitrix CSV export (sanjet) -> products.json for the Whitecross app. Only brand WHITECROSS.

Usage: python3 -I whitecross/tools/import_csv.py export.csv whitecross/products.json
"""
import csv, json, re, sys

SKIP = {'ID элемента', 'Артикул', 'Наименование элемента', 'Описание для анонса', 'Детальное описание',
        'Путь из названий разделов', 'Картинки', 'Варианты исполнения', 'С этим товаром рекомендуем',
        'Цена "Обмен с сайтом"', 'Валюта для цены "Обмен с сайтом"', 'Единица измерения', 'Коэффициент единицы измерения',
        'НДС включен в цену?', 'Ставка НДС', 'Бренд', 'Производитель', 'Базовая единица', 'Новинка', 'Акция', 'Хит',
        'Инструция', 'Товары в комплекте', 'Код ТН ВЭД', 'Коллекция'}  # 'Коллекция [COLLECTION]' duplicates [KOLLEKTSIYA] with a colour suffix


def label(col):
    return re.sub(r'\s*\[[^\]]*\]$', '', col)


def price(raw):
    # The export drops the decimal point of a fixed 6-decimal number: "5500000000" = 5500.000000 ₽.
    raw = raw.strip()
    assert re.fullmatch(r'\d{7,}', raw), f'unexpected price {raw!r}'
    return int(raw) / 1_000_000


def category(path):
    # A product can sit in several sections; the sale sections are not real categories.
    paths = [p.strip() for p in path.split(';') if p.strip() and not p.startswith('РАСПРОДАЖА')]
    return paths[0] if paths else 'Прочее'


def convert(rows):
    out = []
    for x in rows:
        if x['Бренд [BREND_1]'].strip().upper() != 'WHITECROSS':
            continue
        photos = [u for u in x['Картинки [MORE_PHOTO]'].split(';') if u.startswith('https://')]
        props = {label(k): v.strip() for k, v in x.items() if v and v.strip() and label(k) not in SKIP}
        if x['Коллекция [KOLLEKTSIYA]'].strip():
            props = {'Коллекция': x['Коллекция [KOLLEKTSIYA]'].strip(), **props}
        out.append({
            'id': x['ID элемента'], 'art': x['Артикул [CML2_ARTICLE]'].strip(), 'name': x['Наименование элемента'].strip(),
            'cat': category(x['Путь из названий разделов']), 'price': price(x['Цена "Обмен с сайтом"']),
            'photos': photos, 'desc': x['Детальное описание'].strip(), 'props': props,
            'variants': [v.strip() for v in x['Варианты исполнения [MODIFICATIONS]'].split(';') if v.strip()],
            'sale': x['Акция [AKCIYA]'] == 'Да', 'new': x['Новинка [NEW]'] == 'Да',
        })
    return out


if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8-sig', newline='') as f:
        items = convert(csv.DictReader(f, delimiter=';'))
    assert items, 'no WHITECROSS rows'
    assert price('5500000000') == 5500 and category('РАСПРОДАЖА / SALE;Раковины') == 'Раковины'
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, separators=(',', ':'))
    print(len(items), 'products')
