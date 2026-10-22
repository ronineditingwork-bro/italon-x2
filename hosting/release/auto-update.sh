#!/usr/bin/env bash
# Автообновление «только проверенных версий»: следит за веткой $BRANCH (по умолчанию release), в которую коммиты попадают
# ТОЛЬКО из GitHub Actions после успешной проверки (см. .github/workflows/promote-release.yml и ops/release.md).
# Рабочие ветки разработки сервер не видит. Новую версию выкладывает deploy-release.sh (проверка на кандидате, откат при сбое).
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "$HERE/lib.sh"
[ -f /etc/italon-autoupdate.env ] && . /etc/italon-autoupdate.env      # REPO, BRANCH — те же настройки, что у прежнего автообновления
[ -e "$APP_DIR/.freeze" ] && exit 0
remote=$(git ls-remote "$REPO" "refs/heads/$BRANCH" 2>/dev/null | cut -f1)
[ -n "$remote" ] || { log "GitHub недоступен или ветки $BRANCH нет — пропуск"; exit 0; }
deployed=$(cat "$APP_DIR/.deployed-commit" 2>/dev/null || true); attempted=$(cat "$APP_DIR/.attempted-commit" 2>/dev/null || true)
[ "$remote" = "$deployed" ] && exit 0
[ "$remote" = "$attempted" ] && exit 0            # эту версию уже пробовали и она не прошла — ждём нового коммита
log "новая проверенная версия ${remote:0:7} (на сервере ${deployed:0:7})"
BRANCH="$BRANCH" exec "$HERE/deploy-release.sh" "$remote"
