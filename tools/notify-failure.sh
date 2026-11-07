#!/usr/bin/env bash
# Сообщение о сбое для Telegram: репозиторий, workflow, шаг и последние строки ошибки. Читать ничего открывать не нужно.
# Окружение: GH_TOKEN, REPO, RUN_ID, NAME, URL (как в notify-runs.yml).
set -u
JOB=$(gh api "repos/$REPO/actions/runs/$RUN_ID/jobs" --jq '[.jobs[] | select(.conclusion=="failure")][0] | "\(.id)\t\(.name)"' 2>/dev/null || true)
JID=${JOB%%$'\t'*}
STEP=""; WHY=""
if [ -n "$JID" ] && [ "$JID" != "null" ]; then
  STEP=$(gh api "repos/$REPO/actions/jobs/$JID" --jq '[.steps[] | select(.conclusion=="failure")][0].name' 2>/dev/null || true)
  WHY=$(gh api "repos/$REPO/actions/jobs/$JID/logs" 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | grep -iE '##\[error\]|conflict|fatal|error:|traceback|exception' | tail -5 | cut -c1-200 | sed -E 's/^[0-9TZ:.-]+ //' || true)
fi
printf '❌ %s: %s упал\nШаг: %s\nПричина:\n%s\n%s' "${REPO#*/}" "$NAME" "${STEP:-неизвестно}" "${WHY:-не удалось прочитать лог}" "$URL"
