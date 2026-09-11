#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="${VIX_BACKUP_DIR:-/var/backups/vix-voice}"
DESTINATION="${VIX_OFFSITE_DESTINATION:?Defina VIX_OFFSITE_DESTINATION}"
IDENTITY="${VIX_OFFSITE_IDENTITY:-/root/.ssh/vix-offsite}"
KEEP="${VIX_OFFSITE_KEEP:-14}"

[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || { echo "Retenção externa inválida: $KEEP" >&2; exit 1; }
LATEST="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'vix-voice-*.tar.gz' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
[[ -n "$LATEST" && -f "$LATEST.sha256" ]] || { echo "Nenhum backup validado encontrado" >&2; exit 1; }
(cd "$BACKUP_DIR" && sha256sum --check "$(basename "$LATEST.sha256")")

BASE="${LATEST%.tar.gz}"
rsync -a --chmod=F600 \
  -e "ssh -i $IDENTITY -o BatchMode=yes -o StrictHostKeyChecking=yes" \
  "$LATEST" "$LATEST.sha256" "$BASE.json" "$DESTINATION/"

ssh -i "$IDENTITY" -o BatchMode=yes -o StrictHostKeyChecking=yes "${DESTINATION%%:*}" \
  "find '${DESTINATION#*:}' -maxdepth 1 -type f -name 'vix-voice-*.tar.gz' -printf '%T@ %p\\n' | sort -nr | tail -n +$((KEEP + 1)) | cut -d' ' -f2- | while read -r archive; do base=\"\${archive%.tar.gz}\"; rm -f -- \"\$archive\" \"\$archive.sha256\" \"\$base.json\"; done"

echo "Backup externo sincronizado: $(basename "$LATEST")"
