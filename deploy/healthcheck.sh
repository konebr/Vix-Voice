#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE="${VIX_SERVICE:-vix-voice.service}"
BACKUP_SERVICE="${VIX_BACKUP_SERVICE:-vix-voice-backup.service}"
HEALTH_URL="${VIX_HEALTH_URL:-http://127.0.0.1:8787/api/auth/health}"

if systemctl is-active --quiet "$BACKUP_SERVICE"; then
  exit 0
fi

healthy() {
  curl --fail --silent --show-error --max-time 10 "$HEALTH_URL" >/dev/null
}

if healthy; then
  exit 0
fi

logger -p daemon.warning -t vix-voice-health "Vox Voice não respondeu; reiniciando $SERVICE"
systemctl restart "$SERVICE"

for ATTEMPT in 1 2 3 4 5; do
  sleep 2
  if healthy; then
    logger -p daemon.notice -t vix-voice-health "Vox Voice recuperado após reinício"
    exit 0
  fi
done

logger -p daemon.err -t vix-voice-health "Vox Voice continua indisponível após reinício"
exit 1
