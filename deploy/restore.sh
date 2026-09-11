#!/usr/bin/env bash
set -Eeuo pipefail

[[ $# -eq 1 ]] || { echo "Uso: vix-voice-restore /caminho/backup.tar.gz" >&2; exit 2; }

ARCHIVE="$(readlink -f "$1")"
APP_DIR="${VIX_APP_DIR:-/opt/vix-voice/app}"
STATE_DIR="${VIX_STATE_DIR:-$APP_DIR/.wrangler/state}"
SERVICE="${VIX_SERVICE:-vix-voice.service}"
CHECKSUM_FILE="$ARCHIVE.sha256"
RESTORE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/vix-restore.XXXXXX")"
PREVIOUS="$APP_DIR/.wrangler/state.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
RESTART_SERVICE=0

cleanup() {
  rm -rf -- "$RESTORE_ROOT"
  if [[ "$RESTART_SERVICE" == 1 ]]; then
    systemctl start "$SERVICE"
  fi
}
trap cleanup EXIT

[[ -f "$ARCHIVE" ]] || { echo "Backup não encontrado: $ARCHIVE" >&2; exit 1; }
[[ -f "$CHECKSUM_FILE" ]] || { echo "Checksum não encontrado: $CHECKSUM_FILE" >&2; exit 1; }
(cd "$(dirname "$ARCHIVE")" && sha256sum --check "$(basename "$CHECKSUM_FILE")")
STATE_NAME="$(basename "$STATE_DIR")"
tar -tzf "$ARCHIVE" > "$RESTORE_ROOT/archive.list"
grep -q "^$STATE_NAME/" "$RESTORE_ROOT/archive.list" || { echo "Formato de backup inválido" >&2; exit 1; }
tar -C "$RESTORE_ROOT" -xzf "$ARCHIVE"

if systemctl is-active --quiet "$SERVICE"; then
  RESTART_SERVICE=1
  systemctl stop "$SERVICE"
fi

mkdir -p "$(dirname "$STATE_DIR")"
if [[ -d "$STATE_DIR" ]]; then
  mv -- "$STATE_DIR" "$PREVIOUS"
fi
mv -- "$RESTORE_ROOT/$STATE_NAME" "$STATE_DIR"
chown -R "${VIX_STATE_OWNER:-vixvoice:vixvoice}" "$STATE_DIR"

systemctl start "$SERVICE"
RESTART_SERVICE=0
for ATTEMPT in 1 2 3 4 5 6; do
  if curl --fail --silent --max-time 5 "${VIX_HEALTH_URL:-http://127.0.0.1:8787/api/auth/health}" >/dev/null; then
    rm -rf -- "$PREVIOUS"
    echo "Restauração concluída e validada: $ARCHIVE"
    exit 0
  fi
  sleep 2
done

systemctl stop "$SERVICE"
rm -rf -- "$STATE_DIR"
if [[ -d "$PREVIOUS" ]]; then mv -- "$PREVIOUS" "$STATE_DIR"; fi
systemctl start "$SERVICE"
echo "A aplicação não ficou saudável; o estado anterior foi restaurado." >&2
exit 1
