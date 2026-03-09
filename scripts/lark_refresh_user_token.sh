#!/bin/bash
set -euo pipefail

TOKEN_FILE="${LARK_USER_TOKEN_FILE:-/Users/yixiao/.openclaw/workspace/secret/lark_user_access_token.json}"
RUNTIME_FILE="${LARK_RUNTIME_FILE:-/Users/yixiao/.openclaw/workspace/secret/lark_oauth_runtime.json}"
APP_ID="${LARK_APP_ID:-}"
APP_SECRET="${LARK_APP_SECRET:-}"
REFRESH_TOKEN="${LARK_REFRESH_TOKEN:-}"

if [ -f "$RUNTIME_FILE" ]; then
  if [ -z "$APP_ID" ]; then
    APP_ID=$(python3 - <<'PY' "$RUNTIME_FILE"
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('app_id',''))
PY
)
  fi
  if [ -z "$APP_SECRET" ]; then
    APP_SECRET=$(python3 - <<'PY' "$RUNTIME_FILE"
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('app_secret',''))
PY
)
  fi
  if [ -z "$REFRESH_TOKEN" ]; then
    REFRESH_TOKEN=$(python3 - <<'PY' "$RUNTIME_FILE"
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('refresh_token',''))
PY
)
  fi
fi

if [ -z "$APP_ID" ] || [ -z "$APP_SECRET" ]; then
  echo "Missing app_id or app_secret." >&2
  exit 1
fi
if [ -z "$REFRESH_TOKEN" ] && [ -f "$TOKEN_FILE" ]; then
  REFRESH_TOKEN=$(python3 - <<'PY' "$TOKEN_FILE"
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('data', {}).get('refresh_token') or data.get('refresh_token') or '')
PY
)
fi
if [ -z "$REFRESH_TOKEN" ]; then
  echo "refresh_token missing in runtime/token file" >&2
  exit 1
fi

RESP=$(curl -sS -X POST "https://open.larksuite.com/open-apis/authen/v1/refresh_access_token" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"refresh_token\",\"refresh_token\":\"$REFRESH_TOKEN\",\"app_id\":\"$APP_ID\",\"app_secret\":\"$APP_SECRET\"}")

TMP=$(mktemp)
printf '%s\n' "$RESP" > "$TMP"
python3 - <<'PY' "$TOKEN_FILE" "$RUNTIME_FILE" "$TMP"
import json, sys, os
old_path, runtime_path, new_path = sys.argv[1], sys.argv[2], sys.argv[3]
old = {}
if os.path.exists(old_path):
    with open(old_path, 'r', encoding='utf-8') as f:
        old = json.load(f)
with open(new_path, 'r', encoding='utf-8') as f:
    new = json.load(f)
merged = new
old_refresh = old.get('data', {}).get('refresh_token') or old.get('refresh_token')
new_refresh = new.get('data', {}).get('refresh_token') or new.get('refresh_token')
if old_refresh and not new_refresh:
    merged.setdefault('data', {})['refresh_token'] = old_refresh
with open(old_path, 'w', encoding='utf-8') as f:
    json.dump(merged, f)
if os.path.exists(runtime_path):
    with open(runtime_path, 'r', encoding='utf-8') as f:
        runtime = json.load(f)
else:
    runtime = {}
runtime['refresh_token'] = merged.get('data', {}).get('refresh_token') or merged.get('refresh_token') or runtime.get('refresh_token')
with open(runtime_path, 'w', encoding='utf-8') as f:
    json.dump(runtime, f)
PY
rm -f "$TMP"
chmod 600 "$TOKEN_FILE" "$RUNTIME_FILE"
echo "Refreshed token in $TOKEN_FILE"
