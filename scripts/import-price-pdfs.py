#!/usr/bin/env python3
"""Разбор прайс-листов Italon (PDF «Coliseum» и «Contract») в формат data/italon-price-2026-07.json.

Использование: python3 scripts/import-price-pdfs.py coliseum.pdf contract.pdf > added-series.json
Нужен pdftotext (poppler-utils). Скрипт печатает список серий; добавьте их в поле series основного прайса.
"""
import json, re, subprocess, sys

UNIT = {'кв.м': 'Кв.м', 'шт': 'шт'}
ROW = re.compile(r'^\s*(?P<code>\d{12})\s+(?P<name>\S.*?)\s{2,}(?P<unit>Кв\.м|кв\.м|шт|Шт|ШТ)\s+(?P<price>\d+(?:[.,]\d+)?)\s+(?P<rest>.*)$')
SERIE_LAT = re.compile(r'^\s*SERIE\s+(?P<name>\S.*?)(?:\s{2,}.*)?$')
SERIES = re.compile(r'^\s*СЕРИЯ\s+(?P<name>\S.*?)(?:\s{2,}(?P<tail>\S.*))?$')
FORMAT = re.compile(r'^\s*ФОРМАТ:?\s+(?P<fmt>\S.*?)\s{2,}(?:ОБРАБОТКА:?|ПОВЕРХНОСТЬ:?)\s+(?P<finish>\S.*?)\s*$')
NUM = r'\d+(?:[.,]\d+)?'

def num(text):
    return float(text.replace(',', '.').replace(' ', ''))

def parse(path, line_hint):
    text = subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True, text=True, check=True).stdout
    lines = text.splitlines()
    series_list, current, fmt, finish = [], None, '', ''
    skipped = []
    for i, raw in enumerate(lines):
        m = SERIES.match(raw)
        if m and not raw.strip().startswith('СЕРИЯ  Страница') and 'Страница' not in raw:
            name = re.sub(r'\s{2,}.*', '', m.group('name')).strip()
            tail = m.group('tail') or ''
            line = 'Italon Контракт' if 'Контракт' in tail else line_hint
            if not name or name in ('Страница',):
                continue
            current = next((s for s in series_list if s['series'] == name and s['line'] == line), None)
            if not current:
                current = {'series': name, 'line': line, 'items': []}
                series_list.append(current)
            current['latin'] = current.get('latin') or ''
            nxt = next((l for l in lines[i + 1:i + 4] if SERIE_LAT.match(l)), None)
            if nxt and not current['latin']: current['latin'] = SERIE_LAT.match(nxt).group('name').strip()
            continue
        m = FORMAT.match(raw)
        if m:
            fmt, finish = m.group('fmt').strip().upper(), m.group('finish').strip().upper()
            continue
        m = ROW.match(raw)
        if not m:
            if re.match(r'^\s*\d{12}\s', raw): skipped.append(raw.strip())
            continue
        if current is None: raise SystemExit('строка до заголовка серии: ' + raw)
        rest = m.group('rest')
        # штук в коробке, м² в коробке, м² на паллете, минимальный заказ, «только коробками»
        mm = re.match(rf'^(?:(?P<pcs>{NUM})\s+(?P<box>{NUM})\s+(?P<pallet>{NUM})\s+)?(?P<min>\d+\s*(?:паллета|коробка|ШТ|шт)|)\s*(?P<only>да|нет|Да|Нет)?', rest)
        latin = ''
        for nxt in lines[i + 1:i + 4]:
            if nxt.strip() and not ROW.match(nxt):
                latin = re.split(r'\s{2,}', nxt.strip())[0]
                break
        pcs = num(mm.group('pcs')) if mm.group('pcs') else None
        item = {
            'code': m.group('code'), 'name': re.sub(r'\s+', ' ', m.group('name')).strip(), 'latin': latin,
            'fmt': fmt, 'finish': finish, 'unit': UNIT[m.group('unit').lower().replace('кв.м', 'кв.м')],
            'price': int(num(m.group('price'))) if num(m.group('price')).is_integer() else num(m.group('price')),
            'pcs': pcs, 'box': num(mm.group('box')) if mm.group('box') else None,
            'pallet': num(mm.group('pallet')) if mm.group('pallet') else None,
            'min': re.sub(r'\s+', ' ', mm.group('min') or '').strip(),
            'boxonly': (mm.group('only') or '').lower() == 'да',
        }
        current['items'].append(item)
    return series_list, skipped

PREFIX = {'Italon Coliseum': 'coliseum', 'Italon Контракт': 'contract'}

def area(fmt):
    nums = re.findall(r'\d+(?:\.\d+)?', fmt)
    return float(nums[0]) * float(nums[1]) if len(nums) >= 2 and re.fullmatch(r'\d+(?:\.\d+)?X\d+(?:\.\d+)?', fmt) else 0

def finalize(series_list):
    """Слаг «линия-имя», цена «от» (по м², иначе по всем позициям) и форматы плит по убыванию площади."""
    for s in series_list:
        latin = s.pop('latin', '') or s['series']
        s['slug'] = PREFIX[s['line']] + '-' + re.sub(r'[^a-z0-9]+', '-', latin.lower()).strip('-')
        prices = [i['price'] for i in s['items'] if i['unit'] == 'Кв.м'] or [i['price'] for i in s['items']]
        s['from'] = min(prices)
        plates = sorted({i['fmt'] for i in s['items'] if area(i['fmt'])}, key=lambda f: -area(f))
        s['formats'] = plates
    return [{k: s[k] for k in ('slug', 'series', 'line', 'from', 'formats', 'items')} for s in series_list]

if __name__ == '__main__':
    args = sys.argv[1:]
    merge = None
    if '--merge' in args:
        i = args.index('--merge'); merge = args[i + 1]; del args[i:i + 2]
    out = []
    for path, hint in zip(args[0::2], args[1::2]):
        series_list, skipped = parse(path, hint)
        for row in skipped: print('ПРОПУЩЕНО:', row, file=sys.stderr)
        out += series_list
    out = finalize(out)
    if merge:
        data = json.load(open(merge, encoding='utf-8'))
        lines = {s['line'] for s in out}
        data['series'] = [s for s in data['series'] if s['line'] not in lines] + out
        with open(merge, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=1); f.write('\n')
        print(f'добавлено серий: {len(out)}, позиций: {sum(len(s["items"]) for s in out)}', file=sys.stderr)
    else:
        json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
