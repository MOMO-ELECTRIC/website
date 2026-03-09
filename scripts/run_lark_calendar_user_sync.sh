#!/bin/bash
set -euo pipefail

WORKDIR="/Users/yixiao/.openclaw/workspace"
export LARK_RUNTIME_FILE="${LARK_RUNTIME_FILE:-$WORKDIR/secret/lark_oauth_runtime.json}"
export LARK_USER_TOKEN_FILE="${LARK_USER_TOKEN_FILE:-$WORKDIR/secret/lark_user_access_token.json}"

cd "$WORKDIR"
bash scripts/lark_refresh_user_token.sh
bash scripts/lark_calendar_sync_saved_user_token.sh
