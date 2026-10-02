#!/usr/bin/env bash
#
# Cloudflare-only ufw firewall for the Hostinger VPS
# (docs/HOSTINGER_DEPLOYMENT.md §6, REM-025).
#
# Docker publishes container ports by writing iptables rules directly, which
# bypass ufw entirely - that is why docker-compose.prod.yml binds the web and
# api containers to 127.0.0.1 only and does not publish postgres at all. This
# script only has anything to protect because of that binding; it is not a
# substitute for it.
#
# Idempotent: `ufw allow` from an identical rule is a no-op, and `ufw` itself
# dedupes on re-run. Safe to re-run after Cloudflare rotates its ranges.
set -euo pipefail

v4_url="https://www.cloudflare.com/ips-v4"
v6_url="https://www.cloudflare.com/ips-v6"

v4_ranges="$(curl -fsS "$v4_url")"
v6_ranges="$(curl -fsS "$v6_url")"

# Abort rather than enable a half-built rule set: a ufw deny-incoming default
# with no Cloudflare allow rules locks everyone out except SSH, and a
# half-populated allow list (only v4 or only v6) lets through less traffic
# than intended without ever saying so.
if [[ -z "$v4_ranges" || -z "$v6_ranges" ]]; then
  echo "Fetching Cloudflare IP ranges returned empty output; aborting without changing ufw." >&2
  exit 1
fi

echo "Setting default-deny incoming, allow outgoing..."
ufw default deny incoming
ufw default allow outgoing

echo "Allowing 22/tcp (SSH)..."
ufw allow 22/tcp

echo "Allowing 80,443/tcp from Cloudflare's published ranges..."
while IFS= read -r range; do
  [[ -z "$range" ]] && continue
  ufw allow from "$range" to any port 80,443 proto tcp
done <<< "$v4_ranges"$'\n'"$v6_ranges"

echo "Enabling ufw..."
ufw --force enable

echo "Done. Current rules:"
ufw status verbose
