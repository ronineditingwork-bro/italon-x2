#!/usr/bin/env bash
# Страж: если успешной копии не было дольше MAX_AGE_HOURS (таймер выключили, сервер перезагружался, скрипт не запускается) — сообщение администратору.
set -u
CONF="${ITALON_BACKUP_CONF:-/etc/italon-backup.env}"; [ -f "$CONF" ] && . "$CONF"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${STATE_DIR:-/var/lib/italon-backup}"; MAX_AGE_HOURS="${MAX_AGE_HOURS:-30}"; NOTIFY="${NOTIFY:-$HERE/notify.sh}"
last=$(cat "$STATE_DIR/last-success.epoch" 2>/dev/null || echo 0)
age_h=$(( ( $(date +%s) - last ) / 3600 ))
if [ "$last" = 0 ] || [ "$age_h" -gt "$MAX_AGE_HOURS" ]; then
  "$NOTIFY" "⚠️ Italon: резервной копии заявок нет уже ${age_h} ч (порог ${MAX_AGE_HOURS} ч). Проверьте: systemctl status italon-backup.timer; journalctl -u italon-backup -n 50"
  exit 1
fi
echo "OK: последняя копия ${age_h} ч назад"
