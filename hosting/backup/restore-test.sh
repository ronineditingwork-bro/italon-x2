#!/usr/bin/env bash
# Проверка восстановления из зашифрованной копии НА ОТДЕЛЬНОМ КАТАЛОГЕ. Рабочую базу не трогает и не заменяет.
#   restore-test.sh <cart-….sqlite.gz.age> <файл-закрытого-ключа.txt>
# Делает: расшифровка → распаковка → PRAGMA integrity_check → проверка, что приложение откроет базу (миграции на копии) →
# сверка с «паспортом» (*.manifest.json рядом с файлом): контрольная сумма, число заявок и корзин.
# Закрытый ключ хранится у владельца ВНЕ сервера; на сервер его копировать не нужно — проверку можно делать на своём компьютере
# (нужны age и Node.js 22+; вместо Node можно использовать контейнер приложения: ITALON_APP_DIR=/opt/italon-x2 на сервере).
set -Eeuo pipefail
umask 077
file="${1:?укажите файл копии .sqlite.gz.age}"; key="${2:?укажите файл закрытого ключа age}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGE="${AGE:-age}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/italon-restore-XXXXXX")"
trap '[ "${KEEP:-0}" = 1 ] || rm -rf "$WORK"' EXIT
echo "Каталог проверки: $WORK (будет удалён после проверки; KEEP=1 — оставить)"

"$AGE" -d -i "$key" "$file" | gunzip > "$WORK/restored.sqlite"
echo "Расшифровано: $(stat -c %s "$WORK/restored.sqlite") байт"

if command -v node >/dev/null 2>&1 && [ -z "${ITALON_APP_DIR:-}" ]; then
  node "${VERIFY:-$( [ -f "$HERE/backup-verify.mjs" ] && echo "$HERE/backup-verify.mjs" || echo "$HERE/../backup-verify.mjs")}" "$WORK/restored.sqlite" --migrate-check > "$WORK/report.json"
else
  (cd "${ITALON_APP_DIR:?нужен Node.js либо ITALON_APP_DIR с docker compose}" && docker compose run --rm -T --no-deps -v "$WORK:/restore:ro" --entrypoint node app server/backup-verify.mjs /restore/restored.sqlite --migrate-check) > "$WORK/report.json"
fi
cat "$WORK/report.json"

manifest="${file%.age}.manifest.json"
if [ -f "$manifest" ]; then
  python3 - "$WORK/report.json" "$manifest" <<'PY'
import json, sys
got, want = (json.load(open(p)) for p in sys.argv[1:3])
bad = [k for k in ("sha256", "tables", "quotes") if got.get(k) != want.get(k)]
if bad:
    print("ПРОВАЛ: не совпало с паспортом копии:", bad); sys.exit(1)
print("Паспорт копии совпал: контрольная сумма, таблицы, число заявок")
PY
else
  echo "Внимание: паспорта $manifest нет — сверка с исходным состоянием пропущена"
fi
echo "ВОССТАНОВЛЕНИЕ ПРОВЕРЕНО: копия расшифровывается, цела и открывается приложением."
