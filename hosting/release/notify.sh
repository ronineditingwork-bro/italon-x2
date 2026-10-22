#!/usr/bin/env bash
# Сообщение администратору (без персональных данных). Использует те же настройки, что и резервное копирование.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for n in "$NOTIFY_IMPL" /usr/local/lib/italon-backup/notify.sh "$HERE/../backup/notify.sh"; do
  [ -n "$n" ] && [ -x "$n" ] && exec "$n" "$@"
done
echo "notify: $*" >&2
