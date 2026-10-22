# Общие функции скриптов выкладки (подключается через source). Ничего не выполняет при подключении.
# Настройки: /etc/italon-release.env (необязательно) и переменные окружения; значения по умолчанию — для сервера Reg.ru.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "${ITALON_RELEASE_CONF:-/etc/italon-release.env}" ] && . "${ITALON_RELEASE_CONF:-/etc/italon-release.env}"
APP_DIR="${APP_DIR:-/opt/italon-x2}"            # проект docker compose (рабочий сайт)
SRC="${SRC:-/opt/italon-x2-src}"                # исходники для сборки
RELEASES="${RELEASES:-/opt/italon-releases}"    # готовые релизы по sha
IMAGE="${IMAGE:-italon-x2-app}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
DOCKER="${DOCKER:-docker}"
REPO="${REPO:-https://github.com/ronineditingwork-bro/italon-x2}"
BRANCH="${BRANCH:-release}"
NOTIFY="${NOTIFY:-$HERE/notify.sh}"
LOCK="${LOCK:-/var/lock/italon-deploy.lock}"
MIN_FREE_MB="${MIN_FREE_MB:-3000}"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }
alert() { "$NOTIFY" "$1" >/dev/null 2>&1 || true; }
compose() { (cd "$APP_DIR" && APP_TAG="${APP_TAG:-$(cat "$APP_DIR/.deployed-tag" 2>/dev/null || echo none)}" $DOCKER compose -f compose.yaml -f compose.release.yaml "$@"); }
env_value() { { grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null || true; } | head -1 | cut -d= -f2- | tr -d '\r"'; }
domain() { local d; d="$(env_value DOMAIN)"; echo "${d:-italon-x2.ru}"; }
tag_of() { echo "${1:0:12}"; }

# Ждёт, пока приложение отвечает на /healthz. $1 — секунд.
wait_healthy() {
  local i n=$(( ${1:-60} / 2 ))
  for i in $(seq 1 "$n"); do
    if compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" </dev/null >/dev/null 2>&1; then return 0; fi
    sleep "${HEALTH_SLEEP:-2}"
  done
  return 1
}
# Проверка работающего приложения скриптом smoke.mjs внутри контейнера. $1 — имя контейнера или «app» (через compose), $2 — минимум позиций.
smoke() {
  local target="$1" min="$2" mode="${3:-}"
  if [ "$target" = app ]; then compose exec -T app node - "$(domain)" "$min" $mode < "$HERE/smoke.mjs"
  else $DOCKER exec -i "$target" node - "$(domain)" "$min" $mode < "$HERE/smoke.mjs"; fi
}
# Число позиций в каталоге рабочего сайта (чтобы новая версия не могла «потерять» товары).
live_items() { compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>r.json()).then(j=>console.log(j.catalogItems)).catch(()=>console.log(0))" </dev/null 2>/dev/null | tail -1 | tr -dc 0-9; }
record_release() { # $1 sha, $2 тег, $3 событие
  printf '{"time":"%s","event":"%s","sha":"%s","tag":"%s"}\n' "$(date -u +%FT%TZ)" "$3" "$1" "$2" >> "$APP_DIR/releases.log"
}
# Переключает приложение на образ с тегом $1 (контейнер app пересоздаётся; caddy, тома и база не трогаются).
switch_to() {
  APP_TAG="$1" compose up -d --no-build --no-deps app
}
