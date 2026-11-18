#!/usr/bin/env bash
# Автообновление сайта italon-x2.ru на сервере.
#
# Запускается системным таймером (italon-autoupdate.timer) раз в 5 минут: смотрит, появился ли на GitHub
# новый коммит в нужной ветке, и если да — запускает установочный скрипт (он собирает и перезапускает сайт;
# корзины и сертификаты сохраняются).
#
# Настройки лежат в /etc/italon-autoupdate.env (REPO, BRANCH) — их записывает установочный скрипт.
# Журнал: /var/log/italon-autoupdate.log
set -u

REPO="${REPO:-https://github.com/ronineditingwork-bro/italon-x2}"
BRANCH="${BRANCH:-ccr-943f3ebb-rcco8n}"
STATE="${STATE:-/opt/italon-x2}"
LOCK="${LOCK:-/var/lock/italon-autoupdate.lock}"
DEPLOY_CMD="${DEPLOY_CMD:-}"
[ -f /etc/italon-autoupdate.env ] && . /etc/italon-autoupdate.env

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# Один запуск за раз: сборка на 1 ГБ памяти долгая, перекрываться запускам нельзя.
exec 9>"$LOCK"
flock -n 9 || exit 0

remote=$(git ls-remote "$REPO" "refs/heads/$BRANCH" 2>/dev/null | cut -f1)
if [ -z "$remote" ]; then log "GitHub недоступен или ветки $BRANCH нет — пропуск"; exit 0; fi

deployed=$(cat "$STATE/.deployed-commit" 2>/dev/null || true)
attempted=$(cat "$STATE/.attempted-commit" 2>/dev/null || true)

[ "$remote" = "$deployed" ] && exit 0
if [ "$remote" = "$attempted" ]; then
  # Этот коммит уже пытались выложить и не вышло. Ждём нового коммита, чтобы не пересобирать в цикле.
  exit 0
fi

log "новый коммит ${remote:0:7} (на сервере ${deployed:0:7}) — обновляю"
mkdir -p "$STATE"
echo "$remote" > "$STATE/.attempted-commit"

if [ -n "$DEPLOY_CMD" ]; then
  bash -c "$DEPLOY_CMD"
else
  raw="${REPO/github.com/raw.githubusercontent.com}/$BRANCH/hosting/deploy-reg-ru.sh"
  tmp=$(mktemp /tmp/italon-deploy.XXXXXX)
  if curl -fsSL "$raw" -o "$tmp"; then
    REPO="$REPO" BRANCH="$BRANCH" bash "$tmp" </dev/null
  else
    log "не удалось скачать установочный скрипт $raw"
    rm -f "$tmp"
    exit 1
  fi
  rm -f "$tmp"
fi
rc=$?

if [ $rc -eq 0 ]; then
  log "готово: сайт обновлён до ${remote:0:7}"
else
  log "ОШИБКА обновления (код $rc) на ${remote:0:7}; следующая попытка — при новом коммите или ручном запуске установочной команды"
fi
exit $rc
