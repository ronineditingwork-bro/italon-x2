#!/usr/bin/env bash
# Быстрый откат на прежнюю версию (секунды, без сборки): запускает ранее собранный образ. Заявки и корзины (том cart_data) не затрагиваются.
#   italon-rollback              вернуть предыдущую версию (.previous-tag)
#   italon-rollback <тег>        вернуть указанную версию (тег — первые 12 символов sha, см. --list)
#   italon-rollback --list       показать доступные версии и журнал выкладок
#   добавьте --freeze, чтобы после отката автоматические выкладки были приостановлены (снять: rm /opt/italon-x2/.freeze)
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$HERE/lib.sh"
FREEZE=0; ARGS=()
for a in "$@"; do if [ "$a" = --freeze ]; then FREEZE=1; else ARGS+=("$a"); fi; done
if [ "${ARGS[0]:-}" = "--list" ]; then
  echo "Сейчас работает: $(cat "$APP_DIR/.deployed-tag" 2>/dev/null || echo неизвестно) (коммит $(cut -c1-12 "$APP_DIR/.deployed-commit" 2>/dev/null))"
  echo "Предыдущая:      $(cat "$APP_DIR/.previous-tag" 2>/dev/null || echo нет)"
  echo "Доступные образы:"; $DOCKER images "$IMAGE" --format '  {{.Tag}}  {{.CreatedSince}}'
  echo "Журнал (последние 10):"; tail -n 10 "$APP_DIR/releases.log" 2>/dev/null | sed 's/^/  /'
  exit 0
fi
exec 8>"$LOCK"; flock -w 120 8 || { echo "идёт выкладка, повторите позже"; exit 1; }
CUR="$(cat "$APP_DIR/.deployed-tag" 2>/dev/null || true)"
TARGET="${ARGS[0]:-$(cat "$APP_DIR/.previous-tag" 2>/dev/null || true)}"
[ -n "$TARGET" ] || { echo "Не знаю, куда откатываться: нет .previous-tag. Смотрите: italon-rollback --list"; exit 1; }
$DOCKER image inspect "$IMAGE:$TARGET" >/dev/null 2>&1 || { echo "Образа $IMAGE:$TARGET нет на сервере. Доступные:"; $DOCKER images "$IMAGE" --format '  {{.Tag}}'; exit 1; }
[ "$TARGET" != "$CUR" ] || { echo "Версия $TARGET уже работает"; exit 0; }
log "откат: ${CUR:-?} → $TARGET"
BAD_SHA="$(cat "$APP_DIR/.deployed-commit" 2>/dev/null || true)"
switch_to "$TARGET"
if ! wait_healthy 90; then alert "🆘 Italon: откат на $TARGET не поднялся. Проверьте: docker compose logs app"; echo "приложение не стало healthy — смотрите журнал контейнера"; exit 1; fi
smoke app 1 live
SHA="$($DOCKER image inspect "$IMAGE:$TARGET" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)"
echo "$CUR" > "$APP_DIR/.previous-tag"; echo "$TARGET" > "$APP_DIR/.deployed-tag"
if [ -n "$SHA" ]; then echo "$SHA" > "$APP_DIR/.deployed-commit"; fi
if [ -n "$BAD_SHA" ]; then echo "$BAD_SHA" > "$APP_DIR/.attempted-commit"; fi      # чтобы автообновление не вернуло ту же версию
if [ "$FREEZE" = 1 ]; then date -u +%FT%TZ > "$APP_DIR/.freeze"; fi
record_release "${SHA:-}" "$TARGET" rollback
alert "↩️ Italon: сайт возвращён на версию $TARGET (было ${CUR:-?}).$([ "$FREEZE" = 1 ] && echo ' Автовыкладка приостановлена.')"
log "ГОТОВО: работает $TARGET.$([ "$FREEZE" = 1 ] && echo ' Автовыкладка заморожена (rm /opt/italon-x2/.freeze).')"
