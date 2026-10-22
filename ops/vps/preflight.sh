#!/usr/bin/env bash
# ТОЛЬКО ЧТЕНИЕ. Проверка VPS Reg.ru перед установкой механизма выкладки и резервных копий.
#   bash preflight.sh [--db] [--no-net] > preflight.txt
# Скрипт НИЧЕГО не меняет: не пишет файлов, не запускает/останавливает/перезапускает контейнеры и службы, не трогает таймеры, базу, DNS, Docker.
# Секреты не печатаются: из /opt/italon-x2/.env показываются только имена переменных и «задана/пуста».
#   --db      дополнительно открыть базу заявок ТОЛЬКО НА ЧТЕНИЕ внутри работающего контейнера (число записей, quick_check)
#   --no-net  не проверять сеть (GitHub, Docker Hub, Telegram, Яндекс)
# Запускать от root (нужен доступ к docker и /var/lib/docker). Вывод не содержит персональных данных.
# БЕЗОПАСНОСТЬ ВЫВОДА: конфигурации показываются только именами и состоянием («задана/пуста»); значения не печатаются, кроме ветки/адреса репозитория
# (из адреса вырезаются логин и пароль). Строки журналов проходят через фильтр. Кроме того, ВЕСЬ вывод скрипта целиком проходит через фильтр
# redact(): он маскирует токены Telegram/GitHub, ключи age, Bearer-заголовки, пары «имя=значение» для секретных имён, секретные параметры
# в адресах, логин:пароль в адресах и любые длинные «непрозрачные» строки (≥ 32 символов). Коммиты показываются сокращёнными (12 символов).
set -u
APP_DIR="${APP_DIR:-/opt/italon-x2}"
AUTOUPDATE_ENV="${AUTOUPDATE_ENV:-/etc/italon-autoupdate.env}"     # переопределяется только в тестах
AUTOUPDATE_LOG="${AUTOUPDATE_LOG:-/var/log/italon-autoupdate.log}"
REPO="${REPO:-https://github.com/ronineditingwork-bro/italon-x2}"
LIVE_BRANCH="${LIVE_BRANCH:-ccr-943f3ebb-rcco8n}"
DB=0; NET=1
for a in "$@"; do case "$a" in --db) DB=1;; --no-net) NET=0;; *) echo "неизвестный параметр: $a"; exit 2;; esac; done
WARN=0; BAD=0
sec() { printf '\n== %s ==\n' "$*"; }
ok()  { printf '  [OK]        %s\n' "$*"; }
warn(){ printf '  [ВНИМАНИЕ]  %s\n' "$*"; WARN=$((WARN+1)); }
bad() { printf '  [ПРОБЛЕМА]  %s\n' "$*"; BAD=$((BAD+1)); }
info(){ printf '  %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
redact() { # фильтр: ни один секрет не должен дойти до отчёта, даже если команда напечатала его сама
  sed -E \
    -e 's#(://)[^/@[:space:]]+@#\1***@#g' \
    -e 's#[0-9]{6,}:[A-Za-z0-9_-]{20,}#[ТОКЕН-СКРЫТ]#g' \
    -e 's#AGE-SECRET-KEY-[A-Za-z0-9]+#[КЛЮЧ-СКРЫТ]#g' \
    -e 's#(gh[pousr]_|github_pat_|xox[abp]-|sk-|AKIA|ya29\.|y0_|t1\.|AQVN)[A-Za-z0-9_.-]{8,}#[ТОКЕН-СКРЫТ]#g' \
    -e 's#([Aa]uthorization:?[[:space:]]+)([A-Za-z]+[[:space:]]+)?[^[:space:]]+#\1***#g' \
    -e 's#([Bb]earer|[Bb]asic)[[:space:]]+[^[:space:]]+#\1 ***#g' \
    -e 's#("[A-Za-z0-9_.-]*([Tt]oken|[Ss]ecret|[Pp]ass(word|wd)?|[Kk]ey|[Cc]redential|[Aa]uth)[A-Za-z0-9_.-]*"[[:space:]]*:[[:space:]]*")[^"]*#\1***#g' \
    -e 's#([A-Za-z0-9_.-]*([Tt]oken|[Ss]ecret|[Pp]ass(word|wd)?|[Kk]ey|[Cc]redential|[Aa]uth|[Ss]ignature|[Ss]ig)[A-Za-z0-9_.-]*)[[:space:]]*[=:][[:space:]]*[^[:space:]"&,;]+#\1=***#g' \
    -e 's#([?&][A-Za-z0-9_.-]+)=[^&[:space:]"]{12,}#\1=***#g' \
    -e 's#[A-Za-z0-9+_=-]{32,}#[ДЛИННАЯ-СТРОКА-СКРЫТА]#g'
}
envkeys() { [ -f "$APP_DIR/.env" ] || { info ".env нет"; return; }; while IFS='=' read -r k v; do case "$k" in ''|\#*) continue;; esac; v="${v%\"}"; v="${v#\"}"; [ -n "$v" ] && s="задана" || s="ПУСТА"; printf '    %s — %s\n' "$k" "$s"; done < "$APP_DIR/.env"; }
envval() { grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r"' | sed "s/^'//; s/'$//"; }
http() { # аргументы: url [таймаут]; печатает код и время, ничего не сохраняет
  local out; out=$(curl -sS -m "${2:-12}" -o /dev/null -w '%{http_code} %{time_total}s' "$1" 2>/dev/null) || out="нет-ответа"; echo "$out"; }

body() {
echo "Italon preflight (только чтение) — $(date -u +%FT%TZ) — хост $(hostname)"

sec "1. Система, память, swap, диск"
. /etc/os-release 2>/dev/null && info "ОС: ${PRETTY_NAME:-?}; ядро $(uname -r); ЦПУ: $(nproc 2>/dev/null)"
mem_total=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo); mem_avail=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
swap_total=$(awk '/SwapTotal/{print int($2/1024)}' /proc/meminfo); swap_free=$(awk '/SwapFree/{print int($2/1024)}' /proc/meminfo)
info "Память: всего ${mem_total} МБ, доступно ${mem_avail} МБ; swap: всего ${swap_total} МБ, свободно ${swap_free} МБ"
[ "${mem_avail:-0}" -ge 300 ] && ok "доступной памяти достаточно для работы сайта" || warn "доступной памяти меньше 300 МБ: сборка может не поместиться"
if [ "${swap_total:-0}" -ge 1500 ]; then ok "swap ≥ 1,5 ГБ (его создаёт прежний установочный скрипт)"; else bad "swap меньше 1,5 ГБ: на 1 ГБ памяти сборку может убить OOM — создайте swap 2 ГБ до установки (ops/release.md §8)"; fi
have swapon && swapon --show 2>/dev/null | sed 's/^/    /'
for p in / "$APP_DIR" /var/lib/docker /var/backups; do [ -e "$p" ] && printf '    df %s: %s\n' "$p" "$(df -Pm "$p" | awk 'NR==2{printf "свободно %d МБ из %d МБ (%s занято)", $4, $2, $5}')"; done
free_mb=$(df -Pm /var/lib/docker 2>/dev/null | awk 'NR==2{print $4}'); [ -z "$free_mb" ] && free_mb=$(df -Pm / | awk 'NR==2{print $4}')
if [ "${free_mb:-0}" -ge 4000 ]; then ok "свободно ≥ 4 ГБ под образы и релизы"; elif [ "${free_mb:-0}" -ge 3000 ]; then warn "свободно ${free_mb} МБ: скрипт выкладки требует ≥ 3000 МБ, запас мал"; else bad "свободно ${free_mb} МБ: меньше 3000 МБ, выкладка откажется работать"; fi
have timedatectl && timedatectl 2>/dev/null | grep -E "System clock synchronized|Time zone" | sed 's/^ */    /'
oom=$(dmesg 2>/dev/null | grep -ci "out of memory"); [ "${oom:-0}" -gt 0 ] && warn "в журнале ядра есть записи OOM: $oom (убивались процессы из-за нехватки памяти)" || ok "OOM в журнале ядра не найдено"

sec "2. Docker и Caddy"
if ! have docker; then bad "docker не найден"; else
  info "$(docker --version 2>&1)"; info "$(docker compose version 2>&1)"
  if docker info >/dev/null 2>&1; then ok "демон Docker отвечает; корень: $(docker info --format '{{.DockerRootDir}}' 2>/dev/null)"; else bad "демон Docker не отвечает"; fi
  docker ps --format '    {{.Names}}  {{.Image}}  {{.Status}}' 2>/dev/null
  docker images --format '    образ {{.Repository}}:{{.Tag}}  {{.Size}}  {{.CreatedSince}}' 2>/dev/null | head -20
  docker system df 2>/dev/null | sed 's/^/    /'
  [ -f "$APP_DIR/compose.yaml" ] && (cd "$APP_DIR" && docker compose ps --format '    compose: {{.Service}}  {{.Image}}  {{.Status}}' 2>/dev/null)
  for c in app caddy; do
    id=$(cd "$APP_DIR" 2>/dev/null && docker compose ps -q "$c" 2>/dev/null)
    if [ -z "$id" ]; then bad "контейнер $c не запущен"; continue; fi
    st=$(docker inspect "$id" --format '{{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}} перезапусков={{.RestartCount}} запущен={{.State.StartedAt}}')
    info "$c: $st"
    case "$st" in running*) ok "$c работает";; *) bad "$c не в состоянии running";; esac
    [ "$c" = app ] && docker inspect "$id" --format '    образ приложения: {{.Config.Image}}  (ReadOnlyRootfs={{.HostConfig.ReadonlyRootfs}})'
  done
  have openssl && exp=$(echo | timeout 8 openssl s_client -connect 127.0.0.1:443 -servername italon-x2.ru 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null) && info "сертификат Caddy: $exp"
fi

sec "3. Текущая версия сайта и прежнее автообновление"
info "/healthz через локальный Caddy (с сервера, без DNS): $(curl -sS -m 10 --resolve italon-x2.ru:443:127.0.0.1 https://italon-x2.ru/healthz 2>/dev/null | head -c 200)"
info "боевой адрес снаружи (код и время): $(http https://italon-x2.ru/healthz)"
[ -f "$APP_DIR/.deployed-commit" ] && info "выложен коммит: $(cut -c1-12 "$APP_DIR/.deployed-commit")" || warn "нет $APP_DIR/.deployed-commit"
[ -f "$APP_DIR/.attempted-commit" ] && info "последняя попытка: $(cut -c1-12 "$APP_DIR/.attempted-commit")"
if [ -f "$AUTOUPDATE_ENV" ]; then
  info "$AUTOUPDATE_ENV (имя — состояние; значения не печатаются, кроме ветки и адреса репозитория без логина/пароля):"
  while IFS='=' read -r k v; do case "$k" in ''|\#*) continue;; esac; v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
    case "$k" in
      REPO) printf '    REPO: %s\n' "$(echo "$v" | sed -E 's#(://)[^/@]*@#\1#; s#\?.*$##')";;
      BRANCH) printf '    BRANCH: %s\n' "$v";;
      *) [ -n "$v" ] && printf '    %s — задана\n' "$k" || printf '    %s — ПУСТА\n' "$k";;
    esac
  done < "$AUTOUPDATE_ENV"
else warn "нет $AUTOUPDATE_ENV"; fi
[ -x /usr/local/bin/italon-autoupdate ] && info "sha256 /usr/local/bin/italon-autoupdate: $(sha256sum /usr/local/bin/italon-autoupdate | cut -c1-16)…" || warn "нет /usr/local/bin/italon-autoupdate"
if [ -f "$AUTOUPDATE_LOG" ]; then
  info "журнал автообновления (последние 5 строк, с маскировкой секретов, не длиннее 160 символов):"
  tail -n "${AUTOUPDATE_LOG_LINES:-5}" "$AUTOUPDATE_LOG" | cut -c1-160 | redact | sed 's/^/    /'
  info "ошибок в последних 200 строках журнала: $(tail -n 200 "$AUTOUPDATE_LOG" | grep -ci 'ОШИБКА\|error\|fail')"
fi
[ -d /opt/italon-x2-src/.git ] && info "каталог сборки /opt/italon-x2-src: есть, $(du -sm /opt/italon-x2-src 2>/dev/null | cut -f1) МБ"
info "файлы $APP_DIR (имена):"; ls -A "$APP_DIR" 2>/dev/null | tr '\n' ' ' | sed 's/^/    /'; echo
info ".env (только имена и «задана/пуста»):"; envkeys

sec "4. Таймеры и службы systemd"
if have systemctl; then
  systemctl list-timers --all --no-pager 2>/dev/null | grep -Ei "italon|NEXT" | sed 's/^/    /'
  for u in italon-autoupdate.timer italon-release-update.timer italon-backup.timer italon-backup-watchdog.timer; do
    printf '    %-34s активен=%s включён=%s\n' "$u" "$(systemctl is-active "$u" 2>/dev/null)" "$(systemctl is-enabled "$u" 2>/dev/null)"
  done
  systemctl is-active italon-autoupdate.timer >/dev/null 2>&1 && ok "прежнее автообновление работает (так и должно быть до переключения)" || warn "прежнее автообновление не активно"
  systemctl is-active italon-release-update.timer >/dev/null 2>&1 && bad "новый таймер выкладки УЖЕ включён — два механизма не должны работать вместе" || ok "новый таймер выкладки не включён"
else warn "systemctl не найден"; fi

sec "5. Уже установлены ли новые служебные файлы"
for f in /usr/local/lib/italon-release /usr/local/lib/italon-backup /etc/italon-release.env /etc/italon-backup.env /etc/italon-backup /usr/local/bin/italon-rollback "$APP_DIR/compose.release.yaml" "$APP_DIR/.freeze" "$APP_DIR/.deployed-tag"; do
  [ -e "$f" ] && info "есть:  $f" || info "нет:   $f"
done
info "теги образов приложения:"; have docker && docker images italon-x2-app --format '    {{.Tag}}  {{.ID}}  {{.CreatedSince}}' 2>/dev/null

sec "6. SQLite (заявки и корзины)"
if have docker; then
  id=$(cd "$APP_DIR" 2>/dev/null && docker compose ps -q app 2>/dev/null)
  src=$([ -n "$id" ] && docker inspect "$id" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' 2>/dev/null)
  if [ -n "$src" ] && [ -d "$src" ]; then
    info "том данных: $src"; ls -l --time-style=long-iso "$src" 2>/dev/null | sed 's/^/    /'
    du -sk "$src/cart.sqlite" 2>/dev/null | awk '{printf "    cart.sqlite: %.1f МБ\n", $1/1024}'
    [ -f "$src/cart.sqlite" ] && ok "файл базы найден" || bad "cart.sqlite не найден в томе"
  else warn "не удалось определить том /data (контейнер app не запущен?)"; fi
  if [ "$DB" = 1 ] && [ -n "${id:-}" ]; then
    info "чтение базы (только чтение, через работающий контейнер):"
    (cd "$APP_DIR" && docker compose exec -T app node -e "
const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/cart.sqlite',{readOnly:true,timeout:5000});
const q=(s)=>d.prepare(s).get();
console.log(JSON.stringify({quotes:q('select count(*) c from quotes').c,carts:q('select count(*) c from carts').c,lastQuoteAt:q('select max(created_at) m from quotes').m,quickCheck:q('pragma quick_check').quick_check},null,1));d.close()" </dev/null 2>&1 | sed 's/^/    /')
  else info "(чтение внутри базы не выполнялось; добавьте --db, если нужно число заявок)"; fi
fi

if [ "$NET" = 1 ]; then
sec "7. Сеть: GitHub, Docker Hub, Telegram, Яндекс Object Storage"
  have getent && info "DNS github.com: $(getent hosts github.com | head -1)"
  info "github.com:                 $(http https://github.com)"
  info "api.github.com/rate_limit:  $(http https://api.github.com/rate_limit)"
  rem=$(curl -sS -m 12 https://api.github.com/rate_limit 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin)["resources"]["core"]; print(d["remaining"],"из",d["limit"])' 2>/dev/null); [ -n "$rem" ] && info "лимит GitHub API без токена (проверка CI сервером): осталось $rem"
  tip=$(git ls-remote "$REPO" refs/heads/main 2>/dev/null | cut -f1); [ -n "$tip" ] && ok "git ls-remote main: ${tip:0:12}" || bad "git ls-remote не получил main (GitHub недоступен?)"
  live=$(git ls-remote "$REPO" "refs/heads/$LIVE_BRANCH" 2>/dev/null | cut -f1); [ -n "$live" ] && info "боевая ветка: ${live:0:12}"
  info "raw.githubusercontent.com:  $(http https://raw.githubusercontent.com)"
  info "registry-1.docker.io:       $(http https://registry-1.docker.io/v2/) (401 = доступен)"
  tok=$(curl -sS -m 12 "https://auth.docker.io/token?service=registry.docker.io&scope=repository:ratelimitpreview/test:pull" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])' 2>/dev/null)
  if [ -n "$tok" ]; then curl -sSI -m 12 -H "Authorization: Bearer $tok" https://registry-1.docker.io/v2/ratelimitpreview/test/manifests/latest 2>/dev/null | grep -i '^ratelimit' | sed 's/^/    Docker Hub /' | tr -d '\r'; else warn "не удалось получить токен Docker Hub для проверки лимита"; fi
  tg=$(http https://api.telegram.org 8); info "api.telegram.org:           $tg"; case "$tg" in 000*|нет-ответа*) warn "api.telegram.org с этого сервера недоступен — уведомления об ошибках пойдут только через ретранслятор (TELEGRAM_API_BASE)";; esac
  base=$(envval TELEGRAM_API_BASE); if [ -n "$base" ]; then info "ретранслятор Telegram: задан (адрес не печатается) → отвечает: $(http "$(echo "$base" | sed -E 's#^(https?://[^/]+).*#\1#')" 8)"; else info "TELEGRAM_API_BASE не задан"; fi
  info "storage.yandexcloud.net:    $(http https://storage.yandexcloud.net) (403/404 = доступен)"
fi

sec "Итог"
echo "  Проблем: $BAD; предупреждений: $WARN"
[ "$BAD" -eq 0 ] && echo "  Критичных проблем для установки нет." || echo "  Есть проблемы — установку не начинать, пока не устранены."
}

body 2>&1 | redact
exit 0
