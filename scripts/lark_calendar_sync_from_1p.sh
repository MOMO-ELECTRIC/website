#!/bin/bash
set -euo pipefail

SOCKET_DIR="${OPENCLAW_TMUX_SOCKET_DIR:-${CLAWDBOT_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/openclaw-tmux-sockets}}"
SOCKET="${OPENCLAW_OP_TMUX_SOCKET:-$SOCKET_DIR/openclaw-op.sock}"
SESSION="${OPENCLAW_OP_TMUX_SESSION:-op-auth-main}"
ITEM="${LARK_OP_ITEM:-LARK API}"
MODE="${1:-app}"
CALENDAR_NAME="${LARK_CALENDAR_NAME:-MOMO施工同步}"
DRY_RUN_VALUE="${DRY_RUN:-false}"
LIMIT_VALUE="${LARK_CAL_LIMIT:-20}"

if ! tmux -S "$SOCKET" has-session -t "$SESSION" 2>/dev/null; then
  echo "Missing tmux session $SESSION on $SOCKET." >&2
  echo "Run scripts/op_tmux_init.sh first, sign in with op inside tmux, then retry." >&2
  exit 1
fi

if [ "$MODE" = "user" ]; then
  RUN_CMD="cd /Users/yixiao/.openclaw/workspace && export LARK_USER_TOKEN=\$(op item get \"$ITEM\" --fields=credential --reveal) && export LARK_CALENDAR_NAME=\"$CALENDAR_NAME\" && export DRY_RUN=\"$DRY_RUN_VALUE\" && export LARK_LIMIT=\"$LIMIT_VALUE\" && node scripts/lark_calendar_sync_user_token.js"
else
  RUN_CMD="cd /Users/yixiao/.openclaw/workspace && export LARK_OP_ITEM=\"$ITEM\" && export LARK_CALENDAR_NAME=\"$CALENDAR_NAME\" && export DRY_RUN=\"$DRY_RUN_VALUE\" && export LARK_CAL_LIMIT=\"$LIMIT_VALUE\" && node scripts/lark_calendar_sync.js"
fi

TMUX_TARGET="$SESSION":0.0

tmux -S "$SOCKET" send-keys -t "$TMUX_TARGET" C-c
sleep 0.2
tmux -S "$SOCKET" send-keys -t "$TMUX_TARGET" "$RUN_CMD" Enter
sleep 1

tmux -S "$SOCKET" capture-pane -p -J -t "$TMUX_TARGET" -S -200
