#!/bin/bash
set -euo pipefail

TOKEN_FILE="${LARK_USER_TOKEN_FILE:-/Users/yixiao/.openclaw/workspace/secret/lark_user_access_token.json}"
CALENDAR_NAME="${LARK_CALENDAR_NAME:-MOMO 施工日历}"
LIMIT_VALUE="${LARK_LIMIT:-20}"
DRY_RUN_VALUE="${DRY_RUN:-false}"

if [ ! -f "$TOKEN_FILE" ]; then
  echo "Token file not found: $TOKEN_FILE" >&2
  exit 1
fi

TOKEN=$(python3 - <<'PY' "$TOKEN_FILE"
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('access_token',''))
PY
)

if [ -z "$TOKEN" ]; then
  echo "access_token missing in $TOKEN_FILE" >&2
  exit 1
fi

export LARK_USER_TOKEN="$TOKEN"
export LARK_CALENDAR_NAME="$CALENDAR_NAME"
export LARK_LIMIT="$LIMIT_VALUE"
export DRY_RUN="$DRY_RUN_VALUE"

cd /Users/yixiao/.openclaw/workspace
node scripts/lark_calendar_sync_user_token.js
