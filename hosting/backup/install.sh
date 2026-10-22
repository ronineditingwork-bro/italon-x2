#!/usr/bin/env bash
# Установка резервного копирования на сервер (запуск от root, ВРУЧНУЮ, после проверки на тестовой копии — см. ops/backup.md).
# Скрипт НЕ запускает копирование и НЕ включает таймеры, пока не указан --enable. Рабочий сайт и базу не затрагивает.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST=/usr/local/lib/italon-backup
apt-get update -qq && apt-get install -y -qq age rclone python3 curl >/dev/null
install -d -m 755 "$DEST"; install -m 644 "$HERE"/../backup-verify.mjs "$DEST"/ && install -m 755 "$HERE"/backup-run.sh "$HERE"/restore-test.sh "$HERE"/notify.sh "$HERE"/watchdog.sh "$HERE"/prune.py "$DEST"/
install -d -m 700 /etc/italon-backup /var/backups/italon /var/lib/italon-backup
[ -f /etc/italon-backup.env ] || install -m 600 "$HERE/italon-backup.env.example" /etc/italon-backup.env
install -m 644 "$HERE"/systemd/*.service "$HERE"/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
cat <<TXT
Установлено в $DEST. Дальше:
 1. На СВОЁМ компьютере: age-keygen -o italon-backup.key  (закрытый ключ хранить ВНЕ сервера, лучше в двух местах);
    строку «Public key: age1…» записать в /etc/italon-backup/recipients.txt
 2. rclone config  → создать хранилище в РФ, имя записать в RCLONE_REMOTE в /etc/italon-backup.env
 3. Пробный запуск: /usr/local/lib/italon-backup/backup-run.sh  (рабочую базу только читает)
 4. Проверка восстановления на своём компьютере: restore-test.sh <файл.age> italon-backup.key
 5. Включить расписание: $0 --enable
TXT
if [ "${1:-}" = "--enable" ]; then
  systemctl enable --now italon-backup.timer italon-backup-watchdog.timer
  systemctl list-timers 'italon-backup*' --no-pager
fi
