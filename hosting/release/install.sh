#!/usr/bin/env bash
# Установка скриптов выкладки на сервер (от root, ВРУЧНУЮ). Скрипт ТОЛЬКО копирует файлы и ничего не запускает и не включает:
# прежнее автообновление продолжает работать, пока вы сами не переключитесь (ops/release.md, раздел «Переход»).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; DEST=/usr/local/lib/italon-release
install -d -m 755 "$DEST"
install -m 755 "$HERE"/lib.sh "$HERE"/deploy-release.sh "$HERE"/rollback.sh "$HERE"/auto-update.sh "$HERE"/notify.sh "$HERE"/italon-compose "$DEST"/
install -m 644 "$HERE"/smoke.mjs "$HERE"/compose.release.yaml "$DEST"/
ln -sf "$DEST/rollback.sh" /usr/local/bin/italon-rollback; ln -sf "$DEST/italon-compose" /usr/local/bin/italon-compose
install -m 644 "$HERE"/systemd/*.service "$HERE"/systemd/*.timer /etc/systemd/system/; systemctl daemon-reload
# compose.release.yaml нужен рядом с compose.yaml рабочего сайта; старое автообновление его не удаляет только если он есть в релизе
[ -f /opt/italon-x2/compose.release.yaml ] || install -m 644 "$HERE/compose.release.yaml" /opt/italon-x2/compose.release.yaml
echo "Установлено в $DEST. Ничего не запущено. Команды: italon-rollback --list, italon-compose ps."
echo "Первая проверка без риска: $DEST/deploy-release.sh <sha> --dry-run"
