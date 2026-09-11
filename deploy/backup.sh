#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${VIX_APP_DIR:-/opt/vix-voice/app}"
STATE_DIR="${VIX_STATE_DIR:-$APP_DIR/.wrangler/state}"
BACKUP_DIR="${VIX_BACKUP_DIR:-/var/backups/vix-voice}"
SERVICE="${VIX_SERVICE:-vix-voice.service}"
KEEP="${VIX_BACKUP_KEEP:-7}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="vix-voice-$STAMP"
PARTIAL="$BACKUP_DIR/$NAME.tar.gz.partial"
ARCHIVE="$BACKUP_DIR/$NAME.tar.gz"
RESTART_SERVICE=0

restart_vix() {
  rm -f -- "$PARTIAL"
  if [[ "$RESTART_SERVICE" == 1 ]]; then
    systemctl start "$SERVICE"
    RESTART_SERVICE=0
  fi
}
trap restart_vix EXIT

[[ -d "$STATE_DIR" ]] || { echo "Estado não encontrado: $STATE_DIR" >&2; exit 1; }
[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || { echo "Retenção inválida: $KEEP" >&2; exit 1; }
install -d -m 700 "$BACKUP_DIR"

if systemctl is-active --quiet "$SERVICE"; then
  RESTART_SERVICE=1
  systemctl stop "$SERVICE"
fi

sync
# Os rastros do Miniflare crescem continuamente e não fazem parte do banco.
# Excluí-los mantém os backups pequenos sem remover contas, servidores ou mensagens.
STATE_PARENT="$(dirname "$STATE_DIR")"
STATE_NAME="$(basename "$STATE_DIR")"
tar -C "$STATE_PARENT" \
  --exclude="$STATE_NAME/v3/observability" \
  -czf "$PARTIAL" "$STATE_NAME"
tar -tzf "$PARTIAL" >/dev/null
mv -- "$PARTIAL" "$ARCHIVE"
chmod 600 "$ARCHIVE"

if [[ "$RESTART_SERVICE" == 1 ]]; then
  systemctl start "$SERVICE"
  systemctl is-active --quiet "$SERVICE"
  RESTART_SERVICE=0
fi

CHECKSUM="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
printf '%s  %s\n' "$CHECKSUM" "$(basename "$ARCHIVE")" > "$ARCHIVE.sha256"
printf '{\n  "version": 1,\n  "createdAt": "%s",\n  "gitCommit": "%s",\n  "archive": "%s",\n  "sha256": "%s"\n}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || printf unknown)" \
  "$(basename "$ARCHIVE")" "$CHECKSUM" > "$BACKUP_DIR/$NAME.json"
chmod 600 "$ARCHIVE.sha256" "$BACKUP_DIR/$NAME.json"

mapfile -t EXPIRED < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'vix-voice-*.tar.gz' -printf '%T@ %p\n' | sort -nr | tail -n "+$((KEEP + 1))" | awk '{print $2}')
for OLD_ARCHIVE in "${EXPIRED[@]}"; do
  OLD_NAME="${OLD_ARCHIVE%.tar.gz}"
  rm -f -- "$OLD_ARCHIVE" "$OLD_ARCHIVE.sha256" "$OLD_NAME.json"
done

echo "Backup concluído: $ARCHIVE"
