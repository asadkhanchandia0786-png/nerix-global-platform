#!/usr/bin/env bash
# Run ONLY on the dedicated Linux gateway host, from /opt/nerix-gateway.
# Never run this on Replit or an existing office phone system.
set -euo pipefail
if [[ ${EUID} -ne 0 ]]; then echo "Run with sudo on the dedicated gateway host." >&2; exit 1; fi
if [[ "$PWD" != /opt/nerix-gateway ]]; then echo "Run from /opt/nerix-gateway." >&2; exit 1; fi
command -v node >/dev/null
command -v asterisk >/dev/null
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<20||(a===20&&b<19))process.exit(1)'
if [[ ! -f /etc/nerix/gateway.env || ! -f /etc/nerix/gateway-routing.json ]]; then
  echo "Complete /etc/nerix/gateway.env and gateway-routing.json first; see docs/ORACLE-GATEWAY-SETUP.md." >&2; exit 1
fi
if systemctl is-active --quiet nerix-gateway; then
  echo "Drain calls and stop nerix-gateway before installing an update." >&2; exit 1
fi
if ! id nerix-gateway >/dev/null 2>&1; then useradd --system --home-dir /var/lib/nerix-gateway --shell /usr/sbin/nologin nerix-gateway; fi
install -d -o root -g nerix-gateway -m 0750 /etc/nerix
chown root:nerix-gateway /etc/nerix/gateway.env /etc/nerix/gateway-routing.json
chmod 0640 /etc/nerix/gateway.env /etc/nerix/gateway-routing.json
node --env-file=/etc/nerix/gateway.env gateway/check.js
# Generation succeeds before replacing any Asterisk files; originals are backed up.
nerix_generated_dir=$(mktemp -d /etc/nerix/asterisk-build-XXXXXX)
node --env-file=/etc/nerix/gateway.env gateway/configure.js --output "$nerix_generated_dir/config"
install -d -m 0700 "$nerix_generated_dir/backup"
for nerix_file in http.conf ari.conf rtp.conf pjsip.conf extensions.conf modules.conf musiconhold.conf; do
  if [[ -f /etc/asterisk/$nerix_file ]]; then cp -p "/etc/asterisk/$nerix_file" "$nerix_generated_dir/backup/$nerix_file"; fi
  install -o root -g asterisk -m 0640 "$nerix_generated_dir/config/$nerix_file" "/etc/asterisk/$nerix_file"
done
install -d -o nerix-gateway -g nerix-gateway -m 0700 /var/lib/nerix-gateway
install -m 0644 deploy/nerix-gateway.service /etc/systemd/system/nerix-gateway.service
systemctl daemon-reload
printf '%s\n' 'Configuration installed with a private backup. Complete the firewall checks, then restart Asterisk and start nerix-gateway as described in docs/ORACLE-GATEWAY-SETUP.md.'
