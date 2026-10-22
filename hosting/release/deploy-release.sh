#!/usr/bin/env bash
# Выкладка проверенной версии сайта БЕЗ остановки: собрать → проверить на кандидате с копией боевой базы → переключить → проверить → при сбое откатить.
#   deploy-release.sh <sha коммита> [--dry-run]
# --dry-run: всё до переключения включительно (сборка, образ, проверка кандидата на копии базы), рабочий сайт не трогается.
#
# Что НЕ делает: не удаляет и не изменяет заявки и корзины (том cart_data), не трогает сертификаты (том caddy_data), не меняет DNS.
# Миграции базы применяются при старте приложения и всегда только добавляют (проверяется в CI), поэтому откат на прежний образ безопасен.
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$HERE/lib.sh"
SHA="${1:?укажите sha коммита}"; DRY=0; [ "${2:-}" = "--dry-run" ] && DRY=1
TAG="$(tag_of "$SHA")"; STEP="запуск"; CAND="italon-candidate"; TMP=""; SWITCHED=0; PREV_TAG="$(cat "$APP_DIR/.deployed-tag" 2>/dev/null || true)"

MAIN_PID=$$; STARTED=0
cleanup() { [ "$STARTED" = 1 ] || return 0; $DOCKER rm -f "$CAND" >/dev/null 2>&1 || true; if [ -n "$TMP" ]; then rm -rf "${TMP:?}"; fi; }
fail() {
  local code=$?
  [ "$BASHPID" = "$MAIN_PID" ] || exit "$code"          # ошибка внутри $(...) или (...) — обрабатывает основной скрипт
  log "ОШИБКА на шаге «$STEP» (код $code)"
  if [ "$SWITCHED" = 1 ] && [ -n "$PREV_TAG" ]; then
    log "Откат на предыдущую версию $PREV_TAG"
    if switch_to "$PREV_TAG" && wait_healthy 60; then
      record_release "$SHA" "$PREV_TAG" rolled-back
      alert "⚠️ Italon: версия ${TAG} не прошла проверку после переключения, автоматически возвращена ${PREV_TAG}. Сайт работает. Шаг: $STEP."
    else
      alert "🆘 Italon: версия ${TAG} не прошла проверку, АВТООТКАТ НА ${PREV_TAG} ТОЖЕ НЕ УДАЛСЯ. Нужна ручная проверка: italon-rollback --list"
    fi
  else
    record_release "$SHA" "$TAG" failed-before-switch
    alert "⚠️ Italon: выкладка версии ${TAG} остановлена на шаге «$STEP». Рабочий сайт не менялся (работает ${PREV_TAG:-прежняя версия})."
  fi
  echo "$SHA" > "$APP_DIR/.attempted-commit"
  cleanup; exit "$code"
}
exec 8>"$LOCK"; flock -n 8 || { log "уже идёт другая выкладка"; exit 0; }
if [ -e "$APP_DIR/.freeze" ]; then log "выкладки заморожены ($APP_DIR/.freeze)"; exit 0; fi
trap fail ERR
trap cleanup EXIT
STARTED=1

STEP="предпроверки"
$DOCKER info >/dev/null 2>&1 || { echo "docker не отвечает"; false; }
free_mb=$(df -Pm "$(dirname "$RELEASES")" | awk 'NR==2{print $4}'); [ "${free_mb:-0}" -ge "$MIN_FREE_MB" ] || { echo "мало места: ${free_mb} МБ"; false; }
[ -f "$APP_DIR/.env" ] || { echo "нет $APP_DIR/.env"; false; }
LIVE_ITEMS="$(live_items || true)"; LIVE_ITEMS="${LIVE_ITEMS:-0}"
log "версия $TAG; сейчас работает ${PREV_TAG:-неизвестно}; позиций на рабочем сайте: $LIVE_ITEMS"

STEP="получение исходников"
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch -q --depth 1 origin "$SHA" 2>/dev/null || git -C "$SRC" fetch -q --depth 1 origin "$BRANCH"
  git -C "$SRC" checkout -q -f "$SHA"
else
  mkdir -p "$SRC"; git clone -q "$REPO" "$SRC"; git -C "$SRC" checkout -q -f "$SHA"
fi
[ "$(git -C "$SRC" rev-parse HEAD)" = "$SHA" ] || { echo "получен не тот коммит"; false; }

STEP="сборка сайта"
mkdir -p "$RELEASES"
$DOCKER run --rm -e RELEASE_BUILD=1 -v "$SRC":/src -w /src node:24-bookworm-slim bash -c \
  'apt-get update -qq && apt-get install -y -qq git >/dev/null && git config --global --add safe.directory /src && npm ci --no-audit --no-fund --loglevel=error && npm run build && node scripts/verify-catalog.mjs'
rm -rf "${RELEASES:?}/${TAG:?}"; cp -a "$SRC/.hosting-runtime/release" "$RELEASES/$TAG"
[ -f "$RELEASES/$TAG/compose.release.yaml" ] || cp "$HERE/compose.release.yaml" "$RELEASES/$TAG/compose.release.yaml"

STEP="сборка образа"
$DOCKER build -q -t "$IMAGE:$TAG" --label "org.opencontainers.image.revision=$SHA" "$RELEASES/$TAG" >/dev/null

STEP="проверка кандидата на копии боевой базы"
TMP="$(mktemp -d "$RELEASES/.candidate-XXXXXX")"; chmod 777 "$TMP"
if [ "$LIVE_ITEMS" -gt 0 ]; then
  # копия боевой базы штатным snapshot (backup API); миграции кандидата применяются К КОПИИ, а не к рабочей базе
  compose exec -T app node server/backup.mjs /data/backups/.candidate.sqlite >/dev/null
  compose cp app:/data/backups/.candidate.sqlite "$TMP/cart.sqlite" >/dev/null
  compose exec -T app rm -f /data/backups/.candidate.sqlite /data/backups/.candidate.sqlite-wal /data/backups/.candidate.sqlite-shm
  chmod 666 "$TMP/cart.sqlite"
fi
$DOCKER run -d --name "$CAND" -e APP_ORIGIN="https://$(domain)" -e DB_PATH=/data/cart.sqlite -e REQUIRE_CONSENT="$(env_value REQUIRE_CONSENT)" \
  -v "$TMP":/data --read-only --tmpfs /tmp --cap-drop ALL "$IMAGE:$TAG" >/dev/null
for i in $(seq 1 30); do
  $DOCKER exec "$CAND" node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1 && break
  if [ "$i" = 30 ]; then $DOCKER logs --tail 30 "$CAND" || true; echo "кандидат не поднялся"; false; fi
  sleep "${HEALTH_SLEEP:-2}"
done
smoke "$CAND" "$LIVE_ITEMS"
$DOCKER rm -f "$CAND" >/dev/null; rm -rf "${TMP:?}"; TMP=""
log "кандидат $TAG проверен: поднимается на копии боевой базы, каталог не меньше $LIVE_ITEMS позиций"

if [ "$DRY" = 1 ]; then
  log "dry-run: рабочий сайт не менялся. Образ $IMAGE:$TAG оставлен для настоящей выкладки."
  record_release "$SHA" "$TAG" dry-run; trap - ERR; exit 0
fi

STEP="копия базы перед переключением"
if [ -x /usr/local/lib/italon-backup/backup-run.sh ] && [ "${SKIP_BACKUP:-0}" != 1 ]; then /usr/local/lib/italon-backup/backup-run.sh; fi

STEP="обновление настроек compose/Caddy"
for f in compose.yaml compose.release.yaml; do cp "$RELEASES/$TAG/$f" "$APP_DIR/$f.new"; mv "$APP_DIR/$f.new" "$APP_DIR/$f"; done
CADDY_CHANGED=0
if ! cmp -s "$RELEASES/$TAG/Caddyfile" "$APP_DIR/Caddyfile"; then cp "$RELEASES/$TAG/Caddyfile" "$APP_DIR/Caddyfile.new"; CADDY_CHANGED=1; fi
cp "$RELEASES/$TAG/.env.example" "$APP_DIR/.env.example" 2>/dev/null || true
compose config --quiet

STEP="переключение на $TAG"
SWITCHED=1
switch_to "$TAG"
STEP="проверка после переключения"
wait_healthy 90
smoke app "$LIVE_ITEMS" live
STEP="применение Caddyfile"
if [ "$CADDY_CHANGED" = 1 ]; then
  if compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile >/dev/null 2>&1; then
    mv "$APP_DIR/Caddyfile.new" "$APP_DIR/Caddyfile"; compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null
  else
    rm -f "$APP_DIR/Caddyfile.new"; log "новый Caddyfile не прошёл проверку — оставлен прежний"
  fi
fi

STEP="фиксация версии"
SWITCHED=0
echo "$PREV_TAG" > "$APP_DIR/.previous-tag"; echo "$TAG" > "$APP_DIR/.deployed-tag"; echo "$SHA" > "$APP_DIR/.deployed-commit"; rm -f "$APP_DIR/.attempted-commit"
record_release "$SHA" "$TAG" deployed
# оставляем последние KEEP_RELEASES образов и каталогов релизов (текущий и предыдущий — всегда)
keep="$(printf '%s\n%s\n' "$TAG" "$PREV_TAG"; ls -1t "$RELEASES" | grep -E '^[0-9a-f]{12}$' | head -n "$KEEP_RELEASES")"
for d in $(ls -1 "$RELEASES" | grep -E '^[0-9a-f]{12}$'); do
  echo "$keep" | grep -qx "$d" || { rm -rf "${RELEASES:?}/${d:?}"; $DOCKER rmi "$IMAGE:$d" >/dev/null 2>&1 || true; }
done
alert "✅ Italon: выложена версия ${TAG} (${PREV_TAG:-—} → ${TAG}). Позиций в каталоге: не меньше $LIVE_ITEMS. Откат: italon-rollback"
log "ГОТОВО: работает $TAG"
trap - ERR
