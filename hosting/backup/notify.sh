#!/usr/bin/env bash
# Уведомление администратору в Telegram. Текст НЕ должен содержать персональных данных (телефоны, ФИО, адреса).
#   notify.sh "текст"
# Токен и чат берутся из $APP_DIR/.env (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_API_BASE) либо BACKUP_ALERT_CHAT_ID из /etc/italon-backup.env.
set -u
APP_DIR="${APP_DIR:-/opt/italon-x2}"
CONF="${ITALON_BACKUP_CONF:-/etc/italon-backup.env}"; [ -f "$CONF" ] && . "$CONF"
text="${1:-}"
[ -n "$text" ] || exit 0
envval() { grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r"' | sed "s/^'//; s/'$//"; }
token="${TELEGRAM_BOT_TOKEN:-$(envval TELEGRAM_BOT_TOKEN)}"
chat="${BACKUP_ALERT_CHAT_ID:-${TELEGRAM_CHAT_ID:-$(envval TELEGRAM_CHAT_ID)}}"; chat="${chat%%,*}"
base="${TELEGRAM_API_BASE:-$(envval TELEGRAM_API_BASE)}"; base="${base:-https://api.telegram.org}"; base="${base%/}"
if [ -z "$token" ] || [ -z "$chat" ]; then echo "notify: Telegram не настроен, сообщение только в журнал: $text" >&2; exit 0; fi
if [ -n "${NOTIFY_DRY_RUN:-}" ]; then echo "NOTIFY $text"; exit 0; fi
payload=$(python3 -c 'import json,sys; print(json.dumps({"chat_id": sys.argv[1], "text": sys.argv[2], "disable_web_page_preview": True}))' "$chat" "$text")
curl -fsS -m 20 -X POST -H 'Content-Type: application/json' -d "$payload" "$base/bot$token/sendMessage" >/dev/null 2>&1 \
  || echo "notify: не удалось отправить уведомление в Telegram" >&2
exit 0
