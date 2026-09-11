#!/usr/bin/env bash
set -euo pipefail

base="${1:-http://127.0.0.1:8788}"
stamp="$(date +%s%N)"
auth="$(curl -fsS -H 'content-type: application/json' -d "{\"name\":\"Teste SFU\",\"email\":\"sfu-${stamp}@vix.test\",\"password\":\"teste-presenca-123\"}" "$base/api/auth/register")"
token="$(jq -r .token <<<"$auth")"
server="$(curl -fsS -H "authorization: Bearer $token" -H 'content-type: application/json' -d '{"name":"Teste Presenca"}' "$base/api/servers")"
server_id="$(jq -r .id <<<"$server")"
channels="$(curl -fsS -H "authorization: Bearer $token" "$base/api/servers/$server_id/voice-channels")"
channel_id="$(jq -r '.channels[0].id' <<<"$channels")"
curl -fsS -H "authorization: Bearer $token" -H 'content-type: application/json' -d "{\"channel\":\"$channel_id\"}" "$base/api/servers/$server_id/voice" >/dev/null
presence="$(curl -fsS -H "authorization: Bearer $token" "$base/api/servers/$server_id/voice")"
jq -e --arg uid "$(jq -r .user.id <<<"$auth")" --arg channel "$channel_id" '.users | any(.user_id == $uid and .channel == $channel)' <<<"$presence" >/dev/null
printf 'SFU_PRESENCE_OK channel=%s users=%s\n' "$channel_id" "$(jq '.users | length' <<<"$presence")"
