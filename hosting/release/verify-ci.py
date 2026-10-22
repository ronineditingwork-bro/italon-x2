#!/usr/bin/env python3
"""Разрешает выкладку коммита только если GitHub Actions подтвердил его проверки.

  verify-ci.py <sha>        коды выхода: 0 — можно выкладывать; 10 — проверки ещё идут/не запускались (подождать);
                            11 — проверки не пройдены или коммит не из основной ветки (не выкладывать); 12 — GitHub недоступен (подождать)

Зачем: репозиторий публичный и принадлежит личному аккаунту, а у личных репозиториев GitHub не позволяет ограничить запись в ветку
«только GitHub Actions». Поэтому доверие проверяется не правилами ветки, а на самом сервере: коммит принимается, когда
  1) он входит в историю основной ветки (MAIN_BRANCH, по умолчанию main) — в ветку main пишет только владелец репозитория;
  2) все обязательные проверки (REQUIRED_CHECKS, по умолчанию — задания из ci.yml) завершились успешно на ЭТОМ коммите;
  3) эти проверки созданы приложением GitHub Actions (check-run создать вручную с этим автором нельзя).
Публичный API GitHub не требует токена (60 запросов/час на IP; вызывается только при появлении нового коммита). GITHUB_TOKEN, если задан,
используется только для чтения. Скрипт ничего не пишет и ничего не выкладывает.
"""
import json, os, sys, urllib.request, urllib.error

REPO = os.environ.get("REPO", "https://github.com/ronineditingwork-bro/italon-x2").rstrip("/").removesuffix(".git")
API = os.environ.get("GITHUB_API", "https://api.github.com").rstrip("/")
MAIN = os.environ.get("MAIN_BRANCH", "main")
REQUIRED = [s for s in os.environ.get("REQUIRED_CHECKS", "").split("|") if s] or [
    "Тесты, сборка, целостность каталога",
    "Образ Docker собирается и отвечает",
    "Браузерные сценарии",
]
APP_SLUG = os.environ.get("CI_APP_SLUG", "github-actions")


def get(path):
    req = urllib.request.Request(API + path, headers={"Accept": "application/vnd.github+json", "User-Agent": "italon-release-verify"})
    if os.environ.get("GITHUB_TOKEN"):
        req.add_header("Authorization", "Bearer " + os.environ["GITHUB_TOKEN"])
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def main():
    sha = (sys.argv[1] if len(sys.argv) > 1 else "").lower()
    if len(sha) != 40 or any(c not in "0123456789abcdef" for c in sha):
        print("нужен полный sha коммита (40 символов)"); return 11
    slug = "/".join(REPO.split("/")[-2:])
    try:
        cmp_ = get(f"/repos/{slug}/compare/{sha}...{MAIN}")
        if cmp_.get("status") not in ("ahead", "identical"):
            print(f"коммит {sha[:7]} не входит в историю ветки {MAIN} (compare: {cmp_.get('status')})"); return 11
        runs = get(f"/repos/{slug}/commits/{sha}/check-runs?per_page=100").get("check_runs", [])
    except urllib.error.HTTPError as e:
        print(f"GitHub API: HTTP {e.code}"); return 11 if e.code in (404, 422) else 12
    except Exception as e:  # сеть, лимит, разбор ответа
        print(f"GitHub API недоступен: {e}"); return 12
    latest = {}
    for r in runs:
        if (r.get("app") or {}).get("slug") != APP_SLUG:
            continue
        if r["name"] not in latest or r["id"] > latest[r["name"]]["id"]:
            latest[r["name"]] = r
    pending, failed = [], []
    for name in REQUIRED:
        r = latest.get(name)
        if r is None or r.get("status") != "completed":
            pending.append(name)
        elif r.get("conclusion") != "success":
            failed.append(f"{name}: {r.get('conclusion')}")
    if failed:
        print("проверки не пройдены: " + "; ".join(failed)); return 11
    if pending:
        print("проверки ещё не завершены: " + "; ".join(pending)); return 10
    print(f"OK: {len(REQUIRED)} проверок GitHub Actions успешны на {sha[:12]}, коммит входит в {MAIN}"); return 0


if __name__ == "__main__":
    sys.exit(main())
