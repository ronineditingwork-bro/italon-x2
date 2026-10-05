#!/usr/bin/env bash
# Установка и обновление сайта italon-x2.ru на чистом VPS (Ubuntu 22.04/24.04/26.04, запуск от root).
#
#   curl -fsSL https://raw.githubusercontent.com/ronineditingwork-bro/italon-x2/main/hosting/deploy-reg-ru.sh | bash
#
# Повторный запуск = обновление сайта из GitHub. Корзины (том cart_data) и сертификаты сохраняются.
# Переменные (необязательно): BRANCH=main DOMAIN=italon-x2.ru TLS_EMAIL=italon@amanagroup.org
set -euo pipefail

REPO="${REPO:-https://github.com/ronineditingwork-bro/italon-x2}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-italon-x2.ru}"
TLS_EMAIL="${TLS_EMAIL:-italon@amanagroup.org}"
SRC=/opt/italon-x2-src
APP=/opt/italon-x2

[ "$(id -u)" = 0 ] || { echo "Запустите от root (sudo -i)"; exit 1; }

echo "==> 1/6 Swap (на сервере 1 ГБ памяти — без него сборка может упасть)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile; mkswap /swapfile >/dev/null; swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon --show

echo "==> 2/6 Docker и git"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git rsync >/dev/null
if ! { apt-get install -y -qq docker.io docker-compose-v2 >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; }; then
  echo "Пакеты Docker из Ubuntu недоступны — ставлю официальным скриптом get.docker.com"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker --version; docker compose version

echo "==> 3/6 Исходники ($BRANCH)"
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch -q --depth 1 origin "$BRANCH"
  git -C "$SRC" checkout -q -f FETCH_HEAD
else
  rm -rf "$SRC"; git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$SRC"
fi
git -C "$SRC" log -1 --oneline

echo "==> 4/6 Сборка (в контейнере Node 24; на сервер Node ставить не нужно)"
docker run --rm -v "$SRC":/src -w /src node:24-bookworm-slim bash -c \
  'apt-get update -qq && apt-get install -y -qq git >/dev/null && git config --global --add safe.directory /src && npm ci --no-audit --no-fund --loglevel=error && npm run build'

echo "==> 5/6 Выкладка в $APP"
mkdir -p "$APP"
# .env и тома Docker не трогаем
rsync -a --delete --exclude='.env' "$SRC/.hosting-runtime/release/" "$APP/" 2>/dev/null || {
  apt-get install -y -qq rsync >/dev/null
  rsync -a --delete --exclude='.env' "$SRC/.hosting-runtime/release/" "$APP/"
}
if [ ! -f "$APP/.env" ]; then
  printf 'DOMAIN=%s\nTLS_EMAIL=%s\n' "$DOMAIN" "$TLS_EMAIL" > "$APP/.env"
fi

echo "==> 6/6 Запуск"
cd "$APP"
docker compose config --quiet
docker compose up -d --build
ok=0
for i in $(seq 1 30); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/healthz').then(async r=>{console.log(await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))" 2>/dev/null; then ok=1; break; fi
  sleep 2
done
docker compose ps
if [ "$ok" = 1 ]; then echo "OK: приложение отвечает."; else echo "Приложение не отвечает:"; docker compose logs --tail=40 app; exit 1; fi

IP=$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
cat <<EOF

Готово. IP сервера: $IP
Проверка до смены DNS: curl -sI -H 'Host: $DOMAIN' http://$IP/  (ожидается 308 на https)
Теперь в Reg.ru: A-запись @ и www -> $IP. Сертификат Caddy выпустит сам.
Логи сертификата: cd $APP && docker compose logs --tail=50 caddy
EOF
