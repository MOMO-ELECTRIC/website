#!/bin/bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <oauth_code> [redirect_uri]" >&2
  exit 1
fi

CODE="$1"
REDIRECT_URI="${2:-http://localhost:3000/callback}"
OUT_FILE="${LARK_USER_TOKEN_FILE:-/Users/yixiao/.openclaw/workspace/secret/lark_user_access_token.json}"
APP_ID="${LARK_APP_ID:-}"
APP_SECRET="${LARK_APP_SECRET:-}"

if [ -z "$APP_ID" ] || [ -z "$APP_SECRET" ]; then
  echo "Set LARK_APP_ID and LARK_APP_SECRET before running this script." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"

RESP=$(curl -sS -X POST "https://open.larksuite.com/open-apis/authen/v1/access_token" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"authorization_code\",\"code\":\"$CODE\",\"app_id\":\"$APP_ID\",\"app_secret\":\"$APP_SECRET\",\"redirect_uri\":\"$REDIRECT_URI\"}")

printf '%s\n' "$RESP" > "$OUT_FILE"
chmod 600 "$OUT_FILE"
echo "Saved token response to $OUT_FILE"
