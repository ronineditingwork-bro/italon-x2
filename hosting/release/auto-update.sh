#!/usr/bin/env bash
# Автообновление «только проверенных версий»: следит за веткой $BRANCH (по умолчанию main) и выкладывает коммит ТОЛЬКО если
# GitHub Actions подтвердил его проверки (verify-ci.py: коммит в истории main + все обязательные проверки успешны на этом коммите).
# Рабочие ветки разработки сервер не видит. Скрипты выкладки берутся из /usr/local/lib/italon-release, а не из скачанного коммита:
# изменить логику выкладки новым коммитом нельзя. Саму выкладку делает deploy-release.sh (проверка на кандидате, откат при сбое).
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$HERE/lib.sh"
[ -f /etc/italon-autoupdate.env ] && . /etc/italon-autoupdate.env      # REPO, BRANCH — те же настройки, что у прежнего автообновления
[ -e "$APP_DIR/.freeze" ] && exit 0
remote=$(git ls-remote "$REPO" "refs/heads/$BRANCH" 2>/dev/null | cut -f1)
[ -n "$remote" ] || { log "GitHub недоступен или ветки $BRANCH нет — пропуск"; exit 0; }
deployed=$(cat "$APP_DIR/.deployed-commit" 2>/dev/null || true); attempted=$(cat "$APP_DIR/.attempted-commit" 2>/dev/null || true)
[ "$remote" = "$deployed" ] && exit 0
[ "$remote" = "$attempted" ] && exit 0            # эту версию уже пробовали и она не прошла — ждём нового коммита
rejected=$(cat "$APP_DIR/.rejected-commit" 2>/dev/null || true)
verdict="$("${VERIFY_CI:-$HERE/verify-ci.py}" "$remote" 2>&1)"; rc=$?
case "$rc" in
  0) ;;
  11) if [ "$remote" != "$rejected" ]; then   # сообщаем один раз; проверка повторяется (CI могли перезапустить и он стал зелёным)
        echo "$remote" > "$APP_DIR/.rejected-commit"; log "коммит ${remote:0:7} не выкладывается: $verdict"
        alert "⚠️ Italon: коммит ${remote:0:7} в ветке $BRANCH не выкладывается — $verdict. Сайт работает на прежней версии."
      fi; exit 0 ;;
  *) log "коммит ${remote:0:7}: ждём проверки GitHub ($verdict)"; exit 0 ;;
esac
log "новая проверенная версия ${remote:0:7} (на сервере ${deployed:0:7}): $verdict"
BRANCH="$BRANCH" exec "$HERE/deploy-release.sh" "$remote"
