# Команды для VPS Reg.ru — по шагам, с назначением

Я эти команды **не выполнял** и доступа к серверу не имею. Блоки идут по возрастанию риска. Выполняйте от root (`sudo -i`) по одному и сверяйтесь с результатом. Подробный чек-лист — `../CHECKLIST.md`.

## Блок 1. Только чтение (безопасно, ничего не меняет)
```bash
# 1.1 Забрать скрипт проверки во временную папку (только скачивание; ничего не устанавливает)
git clone --depth 1 -b stage1/integration https://github.com/ronineditingwork-bro/italon-x2 /tmp/italon-check
# 1.2 Диагностика: память, swap, диск, Docker, Caddy, таймеры, версия сайта, сеть, размер базы (чтение базы — через --db)
bash /tmp/italon-check/ops/vps/preflight.sh --db > /tmp/preflight.txt 2>&1; less /tmp/preflight.txt
# 1.3 Убедиться, что в отчёте нет секретов (токен, пароли), и прислать его мне
grep -n -i -E 'token|secret|password|key=' /tmp/preflight.txt || echo "секретов не найдено"
```
Что искать: строки `[ПРОБЛЕМА]` (swap < 1,5 ГБ, диск < 3 ГБ, контейнеры не работают, нового таймера быть не должно).

## Блок 2. Подготовка защиты (меняет сервер, но НЕ сайт)
Только после блока 1 без проблем и с вашего решения. Сайт продолжает работать на прежнем механизме.
```bash
# 2.0 Снимок VPS — в панели Reg.ru (точка «до всего»)
# 2.1 Установка скриптов резервного копирования (ставит age, rclone; таймеры НЕ включает)
bash /tmp/italon-check/hosting/backup/install.sh
# 2.2 Публичный ключ age (создан на вашем компьютере: age-keygen -o italon-backup.key; сюда — только строка age1…)
nano /etc/italon-backup/recipients.txt
# 2.3 Хранилище Yandex: ввод ключей скрытый, секреты не попадают в историю — по ops/backup-yandex.md §4
# 2.4 Настройки копирования (RCLONE_REMOTE=italon-ru:ИМЯ-БАКЕТА/prod)
nano /etc/italon-backup.env
# 2.5 Пробная копия (базу только читает) → в Telegram придёт «✅», файл появится в бакете
/usr/local/lib/italon-backup/backup-run.sh
# 2.6 Скачайте файл *.age и *.manifest.json на свой компьютер и проверьте восстановление ТАМ:
#     bash hosting/backup/restore-test.sh cart-….sqlite.gz.age italon-backup.key   → должно закончиться OK
# 2.7 Только после успешной проверки восстановления — включить расписание
bash /tmp/italon-check/hosting/backup/install.sh --enable
```

## Блок 3. Установка механизма выкладки без включения
```bash
# 3.1 Копирует файлы и создаёт команды italon-rollback / italon-compose; ничего не включает и не запускает
bash /tmp/italon-check/hosting/release/install.sh
# 3.2 Метка «версия до перехода» — нужна для отката на то, что работает сейчас (образ не меняется, только имя)
cd /opt/italon-x2 && docker tag $(docker compose images -q app) italon-x2-app:before-release && echo before-release > .deployed-tag
# 3.3 Пробный прогон: собирает и проверяет кандидата на копии боевой базы, сайт НЕ меняется (самый тяжёлый момент для 1 ГБ: следите за free -m)
SHA=$(git ls-remote https://github.com/ronineditingwork-bro/italon-x2 refs/heads/main | cut -f1)
/usr/local/lib/italon-release/deploy-release.sh "$SHA" --dry-run
free -m; dmesg | grep -i 'out of memory' || echo "OOM нет"
```
Шаги 3.1–3.3 делайте подряд: пока работает прежнее автообновление, оно при своей выкладке стирает `compose.release.yaml`.

## Блок 4. Переключение сайта (меняет работающий сайт — отдельное решение, шаги подряд)
```bash
systemctl disable --now italon-autoupdate.timer              # прежний механизм остановлен; сайт продолжает работать
/usr/local/lib/italon-backup/backup-run.sh                    # свежая копия перед переключением
tail -f /var/log/italon-release.log &                         # журнал в соседнем окне
/usr/local/lib/italon-release/deploy-release.sh "$SHA"        # выкладка: перерыв секунды; автооткат при сбое
italon-rollback --list                                        # before-release должен быть «предыдущей»
# проверить сайт, форму заявки (тестовая), затем включить новый таймер:
systemctl enable --now italon-release-update.timer
```

## Блок 5. Возврат (если что-то не так)
```bash
italon-rollback                         # вернуть предыдущую версию (секунды)
italon-rollback before-release          # вернуть ровно то, что работало до перехода
touch /opt/italon-x2/.freeze            # остановить любые выкладки (снять: rm /opt/italon-x2/.freeze)
# полностью на прежний механизм:
systemctl disable --now italon-release-update.timer && systemctl enable --now italon-autoupdate.timer
```
