#!/usr/bin/env bash
set -Eeuo pipefail

METRICS_DIR="${VIX_METRICS_DIR:-/var/log/vix-voice}"
METRICS_FILE="$METRICS_DIR/metrics.jsonl"
HEALTH_URL="${VIX_HEALTH_URL:-http://127.0.0.1:8787/api/auth/health}"
VOICE_URL="${VIX_VOICE_METRICS_URL:-http://127.0.0.1:8787/api/servers/_infra/metrics}"
MAX_LINES="${VIX_METRICS_MAX_LINES:-10080}"

install -d -m 750 "$METRICS_DIR"
read -r _ user nice system idle iowait irq softirq steal _ < /proc/stat
total1=$((user + nice + system + idle + iowait + irq + softirq + steal))
idle1=$((idle + iowait))
sleep 1
read -r _ user nice system idle iowait irq softirq steal _ < /proc/stat
total2=$((user + nice + system + idle + iowait + irq + softirq + steal))
idle2=$((idle + iowait))
cpu="$(awk -v total="$((total2-total1))" -v idle="$((idle2-idle1))" 'BEGIN { if (total<=0) print "0.0"; else printf "%.1f", (total-idle)*100/total }')"
memory="$(awk '/MemTotal:/ {t=$2} /MemAvailable:/ {a=$2} END {printf "%.1f", (t-a)*100/t}' /proc/meminfo)"
disk="$(df -P / | awk 'NR==2 {gsub("%",""); print $5}')"
load="$(awk '{print $1}' /proc/loadavg)"

probe="$(curl --silent --output /dev/null --max-time 10 --write-out '%{http_code} %{time_total}' "$HEALTH_URL" || printf '000 10')"
read -r status latency_seconds <<< "$probe"
latency_ms="$(awk -v value="$latency_seconds" 'BEGIN {printf "%d", value*1000}')"
voice="$(curl --fail --silent --max-time 5 "$VOICE_URL" 2>/dev/null || printf '{"voiceConnections":null,"voiceRooms":null}')"
voice_connections="$(sed -n 's/.*"voiceConnections":\([0-9][0-9]*\).*/\1/p' <<< "$voice")"
voice_rooms="$(sed -n 's/.*"voiceRooms":\([0-9][0-9]*\).*/\1/p' <<< "$voice")"

printf '{"time":"%s","cpuPercent":%s,"memoryPercent":%s,"diskPercent":%s,"load1":%s,"httpStatus":%s,"latencyMs":%s,"voiceConnections":%s,"voiceRooms":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$cpu" "$memory" "$disk" "$load" "${status:-0}" "$latency_ms" \
  "${voice_connections:-null}" "${voice_rooms:-null}" >> "$METRICS_FILE"

lines="$(wc -l < "$METRICS_FILE")"
if (( lines > MAX_LINES + 60 )); then
  tail -n "$MAX_LINES" "$METRICS_FILE" > "$METRICS_FILE.tmp"
  mv -- "$METRICS_FILE.tmp" "$METRICS_FILE"
fi
