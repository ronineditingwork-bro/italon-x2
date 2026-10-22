#!/usr/bin/env python3
"""Какие копии можно удалить. Читает имена файлов (cart-YYYYmmddTHHMMSSZ.*) из stdin, печатает имена на удаление.

Правило «дедушка-отец-сын»: все копии за последние KEEP_DAILY дней, по одной (последней) в неделю за KEEP_WEEKLY недель,
по одной в месяц за KEEP_MONTHLY месяцев. Самые новые MIN_KEEP копий не удаляются никогда, чтобы сбой часов или правил
не мог стереть всё. Файлы с непонятными именами не трогаются."""
import os, re, sys
from datetime import datetime, timedelta, timezone

DAILY, WEEKLY, MONTHLY = (int(os.environ.get(k, d)) for k, d in (("KEEP_DAILY", 14), ("KEEP_WEEKLY", 8), ("KEEP_MONTHLY", 12)))
MIN_KEEP = int(os.environ.get("MIN_KEEP", 3))
now = datetime.strptime(os.environ["NOW"], "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc) if os.environ.get("NOW") else datetime.now(timezone.utc)
pat = re.compile(r"^cart-(\d{8}T\d{6}Z)\.")
items = []
for line in sys.stdin:
    name = line.strip()
    m = pat.match(name)
    if m:
        items.append((datetime.strptime(m.group(1), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc), name))
items.sort(reverse=True)
keep = {name for _, name in items[:MIN_KEEP]}
weeks, months = {}, {}
for ts, name in items:  # от новых к старым: первая встреченная в неделе/месяце — самая поздняя
    age = now - ts
    if age <= timedelta(days=DAILY):
        keep.add(name)
    iso = ts.isocalendar()
    wk = (iso[0], iso[1])
    if age <= timedelta(weeks=WEEKLY) and wk not in weeks:
        weeks[wk] = name; keep.add(name)
    mo = (ts.year, ts.month)
    if age <= timedelta(days=31 * MONTHLY) and mo not in months:
        months[mo] = name; keep.add(name)
for ts, name in items:
    if name not in keep:
        print(name)
