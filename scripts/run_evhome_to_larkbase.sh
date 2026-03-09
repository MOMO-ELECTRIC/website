#!/bin/bash
set -euo pipefail

SOCKET_DIR="${OPENCLAW_TMUX_SOCKET_DIR:-${CLAWDBOT_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/openclaw-tmux-sockets}}"
SOCKET="${OPENCLAW_OP_TMUX_SOCKET:-$SOCKET_DIR/openclaw-op.sock}"
SESSION="${OPENCLAW_OP_TMUX_SESSION:-op-auth-main}"
WORKDIR="/Users/yixiao/.openclaw/workspace"
TMUX_TARGET="$SESSION":0.0

if ! tmux -S "$SOCKET" has-session -t "$SESSION" 2>/dev/null; then
  echo "Missing tmux session $SESSION on $SOCKET." >&2
  echo "Run scripts/op_tmux_init.sh and sign in with op inside tmux first." >&2
  exit 1
fi

RUN_CMD="cd $WORKDIR && node scripts/evhome_export_all.js && node scripts/lark_match_all.js && DRY_RUN=false node scripts/lark_update_all.js"

tmux -S "$SOCKET" send-keys -t "$TMUX_TARGET" C-c
sleep 0.2
tmux -S "$SOCKET" send-keys -t "$TMUX_TARGET" "$RUN_CMD" Enter
sleep 1

tmux -S "$SOCKET" capture-pane -p -J -t "$TMUX_TARGET" -S -200
