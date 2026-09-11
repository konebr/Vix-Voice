#!/usr/bin/env bash
set -euo pipefail

LIVEKIT_VERSION="${LIVEKIT_VERSION:-1.13.5}"
PUBLIC_IP="${PUBLIC_IP:-143.20.50.44}"
PROD_ROOT="${PROD_ROOT:-/opt/vix-voice/app}"
STAGING_ROOT="${STAGING_ROOT:-/opt/vix-voice/staging}"

test "$(id -u)" -eq 0 || { echo "Execute como root." >&2; exit 1; }

archive="$(mktemp)"
extract_dir="$(mktemp -d)"
trap 'rm -f "$archive"; rm -rf "$extract_dir"' EXIT
curl --fail --location --silent --show-error \
  "https://github.com/livekit/livekit/releases/download/v${LIVEKIT_VERSION}/livekit_${LIVEKIT_VERSION}_linux_amd64.tar.gz" \
  --output "$archive"
tar -xzf "$archive" -C "$extract_dir"
install -o root -g root -m 0755 "$extract_dir/livekit-server" /usr/local/bin/livekit-server

id livekit >/dev/null 2>&1 || useradd --system --home /var/lib/livekit --create-home --shell /usr/sbin/nologin livekit
api_key="$(openssl rand -hex 8)"
api_secret="$(openssl rand -hex 32)"
turn_secret="$(sed -n 's/^TURN_SECRET=//p' "$PROD_ROOT/.dev.vars" | tail -n1 | tr -d '\r\n')"

umask 077
cat >/etc/livekit.yaml <<EOF
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50100
  node_ip: ${PUBLIC_IP}
  turn_servers:
    - host: ${PUBLIC_IP}
      port: 3478
      protocol: udp
      secret: "${turn_secret}"
    - host: ${PUBLIC_IP}
      port: 3478
      protocol: tcp
      secret: "${turn_secret}"
room:
  auto_create: true
  empty_timeout: 300
  departure_timeout: 20
logging:
  level: info
keys:
  ${api_key}: ${api_secret}
EOF
chown root:livekit /etc/livekit.yaml
chmod 0640 /etc/livekit.yaml

set_env() {
  local file="$1" key="$2" value="$3" tmp owner group
  tmp="$(mktemp)"
  grep -v "^${key}=" "$file" >"$tmp" || true
  printf '%s=%s\n' "$key" "$value" >>"$tmp"
  owner="$(stat -c %U "$file")"; group="$(stat -c %G "$file")"
  install -o "$owner" -g "$group" -m 0600 "$tmp" "$file"
  rm -f "$tmp"
}

for root in "$PROD_ROOT" "$STAGING_ROOT"; do
  set_env "$root/.dev.vars" LIVEKIT_API_KEY "$api_key"
  set_env "$root/.dev.vars" LIVEKIT_API_SECRET "$api_secret"
  set_env "$root/.dev.vars" LIVEKIT_URL "wss://app.vix-voice.com.br"
done

install -o root -g root -m 0644 /tmp/vix-voice-livekit.service /etc/systemd/system/vix-voice-livekit.service
cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.before-livekit-$(date +%Y%m%d%H%M%S)"
cat >/etc/caddy/Caddyfile <<'EOF'
app.vix-voice.com.br {
	encode zstd gzip
	handle /rtc* {
		reverse_proxy 127.0.0.1:7880
	}
	handle_path /download/* {
		root * /var/www/vix-voice-downloads
		file_server
	}
	handle {
		reverse_proxy 127.0.0.1:8787
	}
}
EOF

ufw allow 7881/tcp comment 'LiveKit WebRTC TCP'
ufw allow 50000:50100/udp comment 'LiveKit WebRTC UDP'
systemctl daemon-reload
systemctl enable --now vix-voice-livekit.service
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
systemctl restart vix-voice.service vix-voice-staging.service

/usr/local/bin/livekit-server --version
systemctl --no-pager --full status vix-voice-livekit.service | sed -n '1,16p'
