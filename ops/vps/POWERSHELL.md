# Установка защиты на VPS — минимальный набор команд для PowerShell

Состояние сервера по вашим данным: Reg.ru, VPS Chestnut Astatum, IP `5.63.152.213`, диск 20 ГБ (свободно ≈ 12 ГБ), `app` и `caddy` работают, `/healthz` — 1202 товара, снимок VPS 8203883, копия SQLite у вас с совпавшими контрольными суммами. **Все шаги ниже сайт не меняют**: ни перезапуска `app`/`caddy`, ни DNS, ни удаления данных и томов, ни обновления Ubuntu, ни включения автовыкладки. Единственное «изменение сервера» — установка пакетов `age`, `rclone` (apt, без `upgrade`) и копирование скриптов в `/usr/local/lib/italon-*`.

Проверенный коммит: `SHA=e9f57bf7187c9722182bd303e2856431fc2b0fce` (GitHub Actions: 3 из 3 зелёные). Все команды привязаны к нему. Я их **не выполнял**: SSH-доступа к серверу у меня нет.

Правила работы: выполняйте блок за блоком; после каждого блока сверяйтесь с «Ожидается»; при любом несовпадении — **остановитесь** и пришлите вывод (он не содержит секретов; ключи вводятся скрытно). Не запускайте ничего, чего нет в этом файле.

## Блок 0. На вашем компьютере: ключ шифрования age (один раз)
```powershell
winget install FiloSottile.age            # затем закройте и откройте PowerShell заново
winget install OpenJS.NodeJS.LTS          # нужен Node.js 22+ для проверки восстановления (если ещё не стоит)
age-keygen -o "$HOME\italon-backup.key"   # закрытый ключ остаётся ТОЛЬКО у вас; в консоли будет строка «Public key: age1…»
age-keygen -y "$HOME\italon-backup.key"   # напечатает только публичный ключ — его мы отправим на сервер
```
- Закрытый ключ `italon-backup.key` не отправляйте никуда (ни мне, ни в GitHub). Сохраните минимум в двух местах вне сервера (менеджер паролей + флешка).
- Рекомендуется второй, запасной ключ: `age-keygen -o "$HOME\italon-backup-spare.key"`, хранить отдельно. Публичные строки обоих ключей пойдут на сервер.
- Если `winget` недоступен: скачайте `age` для Windows со страницы релизов FiloSottile/age и положите `age.exe`, `age-keygen.exe` в папку из PATH.

## Блок 1. В консоли Yandex Cloud (вручную, один раз)
Выполните по `ops/backup-yandex.md` §3: каталог → бакет STANDARD (закрытый) → сервисный аккаунт с ролью `storage.editor` на этот каталог → статический ключ доступа (идентификатор и секрет сохраните в менеджере паролей, они нужны в блоке 3). Включите бюджет-уведомление (например 100 ₽/мес).

## Блок 2. Подключение и установка скриптов копирования
```powershell
ssh -t root@5.63.152.213
```
Дальше — команды **в сессии на сервере** (bash). Сначала подготовка клона во временной папке:
```bash
SHA=e9f57bf7187c9722182bd303e2856431fc2b0fce
git clone -q https://github.com/ronineditingwork-bro/italon-x2 /tmp/italon && git -C /tmp/italon checkout -q "$SHA" && git -C /tmp/italon log -1 --oneline
```
Ожидается: строка `e9f57bf7 Проверка восстановления на компьютере владельца …`.
```bash
bash /tmp/italon/hosting/backup/install.sh
```
Ожидается: «Установлено в /usr/local/lib/italon-backup. Дальше: …». Таймеры **не включаются** (без `--enable`). Сайт не затронут.

## Блок 3. Ключи и хранилище (секреты вводятся скрыто)
```bash
# 3.1 публичные ключи age (вставьте строки age1…; для запасного ключа — вторая строка)
nano /etc/italon-backup/recipients.txt && chmod 600 /etc/italon-backup/recipients.txt

# 3.2 доступ к Yandex Object Storage (ввод скрытый, в историю команд не попадает)
read -rp 'Имя бакета: ' BUCKET
read -rsp 'Идентификатор ключа Yandex: ' KID; echo
read -rsp 'Секретный ключ Yandex: ' KSEC; echo
install -d -m 700 /root/.config/rclone
( umask 077; cat > /root/.config/rclone/rclone.conf <<CONF
[italon-ru]
type = s3
provider = Other
access_key_id = ${KID}
secret_access_key = ${KSEC}
endpoint = https://storage.yandexcloud.net
region = ru-central1
acl = private
no_check_bucket = true
CONF
)
unset KID KSEC
chmod 600 /root/.config/rclone/rclone.conf

# 3.3 настройки копирования (в файл пишутся только имя бакета и политика хранения)
sed -i "s#^RCLONE_REMOTE=.*#RCLONE_REMOTE=italon-ru:${BUCKET}/prod#" /etc/italon-backup.env
grep -E '^(RCLONE_REMOTE|REQUIRE_OFFSITE|KEEP_|LOCAL_KEEP_)' /etc/italon-backup.env

# 3.4 проверка доступа к бакету (список пуст — это нормально)
rclone lsf "italon-ru:${BUCKET}" && echo "доступ к бакету есть"
```
Ожидается: `RCLONE_REMOTE=italon-ru:<бакет>/prod`, `REQUIRE_OFFSITE=1`, `KEEP_DAILY=14 …`, `LOCAL_KEEP_DAILY=7 …`, затем «доступ к бакету есть».

## Блок 4. Пробная копия и проверка восстановления
```bash
/usr/local/lib/italon-backup/backup-run.sh
ls -l /var/backups/italon
```
Ожидается: строка `OK: cart-….sqlite.gz.age (… байт), заявок в копии: N` (N — число заявок), в `/var/backups/italon` файлы `.age` и `.manifest.json`; в Telegram может прийти «✅» (если настроено). Рабочая база только читалась. Закройте сессию (`exit`) и **на своём компьютере**:
```powershell
mkdir "$HOME\italon-restore" -Force | Out-Null
scp "root@5.63.152.213:/var/backups/italon/cart-*" "$HOME\italon-restore\"
# скачивание только нужных файлов, привязанных к проверенному коммиту (Git на компьютере не нужен)
$sha = "e9f57bf7187c9722182bd303e2856431fc2b0fce"; $raw = "https://raw.githubusercontent.com/ronineditingwork-bro/italon-x2/$sha"; $src = "$HOME\italon-src"
foreach ($p in "hosting/backup/restore-check.mjs","hosting/backup-verify.mjs","hosting/database.mjs","drizzle/0000_furry_eddie_brock.sql","drizzle/0001_quotes.sql","drizzle/0002_quote_consent.sql") {
  $dst = Join-Path $src ($p -replace "/","\"); New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null
  Invoke-WebRequest "$raw/$p" -OutFile $dst
}
$f = (Get-ChildItem "$HOME\italon-restore\cart-*.age" | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
node "$HOME\italon-src\hosting\backup\restore-check.mjs" $f "$HOME\italon-backup.key"
```
Ожидается в конце: `Паспорт копии совпал…` и `ВОССТАНОВЛЕНИЕ ПРОВЕРЕНО…`. Число заявок в выводе должно совпасть с числом в вашей отдельной копии SQLite. Если не совпало — **стоп**, не включайте расписание.
Дополнительно (один раз): убедитесь, что файл есть и в бакете (консоль Yandex Cloud → бакет → `prod/`).

## Блок 5. Включение расписания копий
Только после успешного блока 4:
```powershell
ssh -t root@5.63.152.213
```
```bash
bash /tmp/italon/hosting/backup/install.sh --enable
systemctl list-timers 'italon-backup*' --no-pager
```
Ожидается: два таймера (`italon-backup.timer` 03:20 и страховочный, `italon-backup-watchdog.timer`). Копия раз в сутки; в хранилище 14 суточных + 8 недельных + 12 месячных, на сервере 7.

## Блок 6. Установка скриптов выкладки (без включения)
В той же сессии на сервере:
```bash
bash /tmp/italon/hosting/release/install.sh
ls /usr/local/lib/italon-release /opt/italon-x2/compose.release.yaml
```
Ожидается: «Установлено … Ничего не запущено». Прежнее автообновление продолжает работать — **не отключайте его**.
Сразу же (шаги 6 → 7 → 8 подряд, пока прежний механизм не стёр `compose.release.yaml`):

## Блок 7. Метка «версия до перехода» и пробный прогон (сайт не меняется)
```bash
cd /opt/italon-x2
docker tag "$(docker compose images -q app)" italon-x2-app:before-release     # только новое имя для уже существующего образа
echo before-release > .deployed-tag
docker images italon-x2-app --format '{{.Tag}} {{.ID}}'                         # before-release и latest должны иметь один и тот же ID
free -m; swapon --show
/usr/local/lib/italon-release/deploy-release.sh "$SHA" --dry-run 2>&1 | tail -15
```
Ожидается: в конце «кандидат e9f57bf7187c проверен: поднимается на копии боевой базы, каталог не меньше 1202 позиций» и «dry-run: рабочий сайт не менялся». Что делает прогон: клонирует код во временный каталог сборки, собирает сайт и образ (≈ 3–6 минут, загрузка памяти — до ≈ 200 МБ плюс docker build), снимает штатный снимок боевой базы и проверяет **кандидата на копии** в отдельном контейнере; рабочий контейнер не перезапускается.
Затем проверьте:
```bash
docker ps --format '{{.Names}} {{.Image}} {{.Status}}'     # app и caddy — те же и работают (app: italon-x2-app, не изменился)
curl -s https://italon-x2.ru/healthz                        # 1202 товара
dmesg | grep -i 'out of memory' || echo "OOM нет"
cat /opt/italon-x2/releases.log
df -h / | tail -1
```
Если прогон упал (код ≠ 0): сайт при этом **не затронут**; пришлите последние 30 строк вывода. Повторять `--dry-run` можно сколько угодно.

## Блок 8. Проверка отката (без переключения сайта)
Откат на «версию до перехода» реально проверяется только на переключённом сайте, поэтому сейчас проверяем готовность:
```bash
/usr/local/lib/italon-release/rollback.sh --list
```
Ожидается: «Сейчас работает: before-release», в списке образов есть `before-release` (и `1fde…`/`e9f5…` после dry-run). Команды `italon-rollback`, `italon-compose` на месте (`which italon-rollback`). Репетиция полного цикла (выкладка → откат на `before-release` → автооткат при сбое проверки) пройдена мной на настоящем Docker с «старым» контейнером, собранным из боевой ветки; на вашем VPS это будет выполнено при переключении (`CHECKLIST.md`, D).

## Блок 9. Что НЕ делать сейчас
- Не запускать `deploy-release.sh` без `--dry-run`, не включать `italon-release-update.timer`, не отключать `italon-autoupdate.timer`.
- Не создавать ветку `release`, не включать `RELEASE_PROMOTION`.
- Не запускать `deploy-reg-ru.sh` заново.
- Не удалять `/opt/italon-x2/.env`, тома `cart_data`, `caddy_data`, образы.

## Что прислать мне после выполнения
Вывод блоков 4 (последние строки restore-check), 5 (`list-timers`), 7 и 8. Секреты в этом выводе не появляются; просмотрите его перед отправкой.
