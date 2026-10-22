# Чек-лист внедрения и возврата прежней версии

Отмечайте шаги по порядку. Каждый пункт с пометкой **[VPS]** меняет сервер — делается только с вашего решения. Пункты без пометки безопасны. Подробности — в `release.md` (§8–9, §11) и `backup.md`/`backup-yandex.md`.

## A. До любых действий на сервере
- [ ] Просмотрена ветка `stage1/integration` (диф относительно `main`: 103 коммита, конфликтов нет); решение о слиянии в `main` принято вами.
- [ ] Проверено, что GitHub Pages публикуется **из боевой ветки** `ccr-943f3ebb-rcco8n`, а не из `main` (по журналу запусков `pages-build-deployment`: все 32 запуска из этой ветки) — слияние в `main` страницу предпросмотра не перезапустит. Настройки Pages не менялись.
- [ ] CI на нужном SHA зелёный: `python3 hosting/release/verify-ci.py <полный sha>` (на ветке, не равной `main`, задайте `MAIN_BRANCH=<ветка>`).
- [ ] 2FA включена у владельца GitHub; на `main` запрещены force-push и удаление ветки (`release.md` §5).
- [ ] Выбрано хранилище копий, создан бакет, сервисный аккаунт и ключ (`backup-yandex.md` §3); ключ `age` создан **у вас** и сохранён в двух местах.
- [ ] Юридические тексты — отдельный поток (`legal/`); установка выкладки и копий от них не зависит.

## B. Диагностика сервера (только чтение) **[VPS]**
- [ ] `sudo bash ops/vps/preflight.sh --db > preflight.txt` выполнен, просмотрен, секретов в файле нет.
- [ ] Нет строк `[ПРОБЛЕМА]`: swap ≥ 1,5 ГБ, диск ≥ 4 ГБ, Docker, `app` и `caddy` работают, GitHub и Docker Hub доступны, лимит Docker Hub не исчерпан, прежний таймер активен, нового таймера нет.
- [ ] Размер `cart.sqlite` и число заявок записаны (для `backup-sizing.mjs`).
- [ ] В панели Reg.ru сделан **снимок VPS** («точка до всего»).

## C. Установка без включения **[VPS]**
- [ ] `git clone --depth 1 -b <ветка> …` в `/tmp` и `sudo bash hosting/backup/install.sh` (файлы и пакеты `age`, `rclone`; таймеры не включаются).
- [ ] `recipients.txt` с публичным ключом(ами) `age`; `rclone.conf` по `backup-yandex.md` §4; `/etc/italon-backup.env` заполнен.
- [ ] `sudo /usr/local/lib/italon-backup/backup-run.sh` → в Telegram «✅», файлы в бакете.
- [ ] **Восстановление проверено на вашем компьютере** (`restore-test.sh` → OK, числа совпали).
- [ ] Имитация сбоя копии дала сообщение в Telegram (один раз).
- [ ] `sudo bash hosting/backup/install.sh --enable` (таймеры копирования и «сторожа»).
- [ ] `sudo bash hosting/release/install.sh` (скрипты выкладки; ничего не включает).
- [ ] Метка версии «до перехода»: `cd /opt/italon-x2 && docker tag $(docker compose images -q app) italon-x2-app:before-release && echo before-release > .deployed-tag`.
- [ ] `deploy-release.sh <sha main> --dry-run` прошёл: кандидат поднялся на копии боевой базы, проверка каталога без ошибок, `free -m` без нехватки памяти, `dmesg | grep -i oom` пусто.

## D. Переключение (в спокойное время, шаги подряд) **[VPS]**
- [ ] `systemctl disable --now italon-autoupdate.timer` (текущий сайт продолжает работать).
- [ ] Свежая копия (`backup-run.sh`) выполнена.
- [ ] `deploy-release.sh <sha main>` с открытым журналом; автоматические проверки до и после переключения прошли.
- [ ] Проверено вручную: главная, каталог, карточка товара, фото, калькулятор, корзина → КП → тестовая заявка дошла в Telegram и записана; `italon-rollback --list` показывает `before-release` как предыдущую.
- [ ] `systemctl enable --now italon-release-update.timer`.
- [ ] Неделя наблюдения: `tail -f /var/log/italon-release.log`, сообщения в Telegram; `releases.log` без `rolled-back`/`failed-*`, либо причины разобраны.

## E. Возврат прежней версии сайта (если что-то не так)
| Ситуация | Действие |
|---|---|
| Идёт выкладка и проверка не прошла | ничего: автооткат вернёт предыдущий образ (секунды) |
| Выложено и замечена ошибка | `italon-rollback` (предыдущая) или `italon-rollback before-release` (то, что работало до перехода); `--freeze`, чтобы автовыкладка не вернула ту же версию |
| Нужно остановить любые выкладки | `touch /opt/italon-x2/.freeze` |
| Полностью вернуться на старый механизм | `systemctl disable --now italon-release-update.timer && systemctl enable --now italon-autoupdate.timer` — прежний скрипт сам пересоберёт сайт; его настройки не менялись |
| Повреждена или потеряна база | `.freeze`; восстановление из копии — `backup.md` §5 (сначала сохранить повреждённый файл) |
| Сервер потерян целиком | новый VPS по `TRANSFER.md`/`deploy-reg-ru.sh`, затем база из копии (нужен закрытый ключ `age`) |
| Не получается ничего | снимок VPS в панели Reg.ru (шаг B) |

## F. Чего не делать
- Не запускать одновременно два механизма и не запускать `curl …/deploy-reg-ru.sh | bash` после переключения (включит старый таймер).
- Не включать `RELEASE_PROMOTION`, не создавать ветку `release`.
- Не отправлять закрытый ключ `age`, ключи Yandex и токен Telegram в чат/GitHub.
- Не удалять `/opt/italon-x2/.env`, тома `cart_data`, `caddy_data`.
