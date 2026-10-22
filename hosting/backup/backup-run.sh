#!/usr/bin/env bash
# Ежедневная зашифрованная резервная копия базы заявок и корзин (SQLite).
#
# Шаги: снимок штатным механизмом SQLite (backup API, а не cp рабочего файла) → проверка целостности и «паспорт» копии →
# сжатие → шифрование открытым ключом age (расшифровать может только владелец закрытого ключа, на сервере его нет) →
# локальное хранение → выгрузка в хранилище в РФ (rclone) → проверка выгрузки → ротация → отметка об успехе.
# При любой ошибке — сообщение администратору в Telegram (без персональных данных) и код возврата ≠ 0.
#
# Базу и заявки скрипт НЕ изменяет и НЕ удаляет: только читает снимком и пишет свои файлы в $LOCAL_DIR и во временный каталог.
# Настройки: /etc/italon-backup.env (см. hosting/backup/italon-backup.env.example).
set -Eeuo pipefail
umask 077

CONF="${ITALON_BACKUP_CONF:-/etc/italon-backup.env}"; [ -f "$CONF" ] && . "$CONF"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-/opt/italon-x2}"
LOCAL_DIR="${LOCAL_DIR:-/var/backups/italon}"
STATE_DIR="${STATE_DIR:-/var/lib/italon-backup}"
DOCKER="${DOCKER:-docker}"; AGE="${AGE:-age}"; RCLONE="${RCLONE:-rclone}"
AGE_RECIPIENTS="${AGE_RECIPIENTS:-/etc/italon-backup/recipients.txt}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"                  # например italon-ru:italon-backups  (хранилище в РФ)
REQUIRE_OFFSITE="${REQUIRE_OFFSITE:-1}"             # 1: без выгрузки вне сервера копия считается неудачной
MIN_FREE_MB="${MIN_FREE_MB:-300}"
NOTIFY="${NOTIFY:-$HERE/notify.sh}"
export APP_DIR
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"; NAME="cart-$STAMP.sqlite.gz.age"
STEP="запуск"; WORK=""

alert() { "$NOTIFY" "$1" || true; }
cleanup() { [ -n "$WORK" ] && [ -d "$WORK" ] && rm -rf "$WORK"; (cd "$APP_DIR" 2>/dev/null && $DOCKER compose exec -T app rm -f "/data/backups/.snap-$STAMP.sqlite" "/data/backups/.snap-$STAMP.sqlite-wal" "/data/backups/.snap-$STAMP.sqlite-shm" >/dev/null 2>&1) || true; }
on_error() {
  local code=$?
  echo "$(date -u +%FT%TZ) ОШИБКА на шаге «$STEP» (код $code)" >&2
  alert "⚠️ Italon: резервная копия заявок НЕ выполнена. Шаг: $STEP. Сервер: $(hostname). Время: $(date -u +%FT%TZ). Предыдущая успешная: $(cat "$STATE_DIR/last-success" 2>/dev/null | cut -d' ' -f1-2 || echo неизвестно)."
  cleanup; exit "$code"
}
trap on_error ERR
trap cleanup EXIT

mkdir -p "$LOCAL_DIR" "$STATE_DIR"; chmod 700 "$LOCAL_DIR" "$STATE_DIR"
exec 9>"$STATE_DIR/lock"; flock -n 9 || { echo "уже выполняется другая копия"; exit 0; }
WORK="$(mktemp -d "$LOCAL_DIR/.work-XXXXXX")"

STEP="проверка настроек"
[ -s "$AGE_RECIPIENTS" ] || { echo "нет файла получателей age: $AGE_RECIPIENTS"; false; }
if [ "$REQUIRE_OFFSITE" = 1 ] && [ -z "$RCLONE_REMOTE" ]; then echo "RCLONE_REMOTE не задан: копия вне сервера обязательна"; false; fi
free_mb=$(df -Pm "$LOCAL_DIR" | awk 'NR==2{print $4}'); [ "${free_mb:-0}" -ge "$MIN_FREE_MB" ] || { echo "мало места: ${free_mb} МБ"; false; }

STEP="снимок базы (SQLite backup API)"
cd "$APP_DIR"
SNAP_IN="/data/backups/.snap-$STAMP.sqlite"
$DOCKER compose exec -T app node server/backup.mjs "$SNAP_IN" >/dev/null

STEP="проверка целостности копии"
$DOCKER compose exec -T app node server/backup-verify.mjs "$SNAP_IN" --migrate-check > "$WORK/manifest.json"
python3 - "$WORK/manifest.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
assert m["integrity"] == "ok" and m["foreignKeyViolations"] == 0 and m.get("migrateCheck") == "ok", m
PY

STEP="копирование снимка из контейнера"
$DOCKER compose cp "app:$SNAP_IN" "$WORK/snapshot.sqlite" >/dev/null
$DOCKER compose exec -T app rm -f "$SNAP_IN" "$SNAP_IN-wal" "$SNAP_IN-shm"
want="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sha256"])' "$WORK/manifest.json")"
have="$(sha256sum "$WORK/snapshot.sqlite" | cut -d' ' -f1)"
[ "$want" = "$have" ] || { echo "контрольная сумма снимка не совпала"; false; }

STEP="сжатие и шифрование"
gzip -9 -c "$WORK/snapshot.sqlite" | "$AGE" -R "$AGE_RECIPIENTS" -o "$WORK/$NAME"
[ -s "$WORK/$NAME" ] || { echo "пустой зашифрованный файл"; false; }
# в «паспорт» добавляем только технические поля; персональных данных в нём нет
python3 - "$WORK/manifest.json" "$NAME" "$STAMP" "$(stat -c %s "$WORK/$NAME")" > "$WORK/${NAME%.age}.manifest.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1])); m.update({"encryptedName": sys.argv[2], "createdAtUtc": sys.argv[3], "encryptedBytes": int(sys.argv[4]), "format": "sqlite -> gzip -> age (X25519)"})
print(json.dumps(m, ensure_ascii=False, indent=2))
PY
rm -f "$WORK/snapshot.sqlite"               # открытая копия на диске не остаётся

STEP="сохранение на сервере"
mv "$WORK/$NAME" "$LOCAL_DIR/$NAME"; mv "$WORK/${NAME%.age}.manifest.json" "$LOCAL_DIR/${NAME%.age}.manifest.json"

if [ -n "$RCLONE_REMOTE" ]; then
  STEP="выгрузка вне сервера"
  $RCLONE copyto "$LOCAL_DIR/$NAME" "$RCLONE_REMOTE/$NAME"
  $RCLONE copyto "$LOCAL_DIR/${NAME%.age}.manifest.json" "$RCLONE_REMOTE/${NAME%.age}.manifest.json"
  STEP="проверка выгрузки"
  remote_size="$($RCLONE lsjson "$RCLONE_REMOTE/$NAME" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["Size"] if d else -1)')"
  [ "$remote_size" = "$(stat -c %s "$LOCAL_DIR/$NAME")" ] || { echo "размер в хранилище ($remote_size) не совпал"; false; }
fi

STEP="ротация"
( cd "$LOCAL_DIR" && ls -1 | grep -E '^cart-.*\.age$' | NOW="$STAMP" python3 "$HERE/prune.py" | while read -r old; do rm -f "$LOCAL_DIR/$old" "$LOCAL_DIR/${old%.age}.manifest.json"; done )
if [ -n "$RCLONE_REMOTE" ]; then
  $RCLONE lsf "$RCLONE_REMOTE" | grep -E '^cart-.*\.age$' | NOW="$STAMP" python3 "$HERE/prune.py" | while read -r old; do
    $RCLONE deletefile "$RCLONE_REMOTE/$old"; $RCLONE deletefile "$RCLONE_REMOTE/${old%.age}.manifest.json" || true
  done
fi

STEP="отметка об успехе"
echo "$STAMP $NAME" > "$STATE_DIR/last-success.tmp"; mv "$STATE_DIR/last-success.tmp" "$STATE_DIR/last-success"
date +%s > "$STATE_DIR/last-success.epoch"
[ -n "${HC_PING_URL:-}" ] && curl -fsS -m 15 "$HC_PING_URL" >/dev/null 2>&1 || true
echo "$(date -u +%FT%TZ) OK: $NAME ($(stat -c %s "$LOCAL_DIR/$NAME") байт), заявок в копии: $(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["quotes"]["count"])' "$LOCAL_DIR/${NAME%.age}.manifest.json")"
