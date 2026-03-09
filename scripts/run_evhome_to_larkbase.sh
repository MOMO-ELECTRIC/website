#!/bin/bash
set -euo pipefail

SOCKET_DIR="${OPENCLAW_TMUX_SOCKET_DIR:-${CLAWDBOT_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/openclaw-tmux-sockets}}"
SOCKET="${OPENCLAW_OP_TMUX_SOCKET:-$SOCKET_DIR/openclaw-op.sock}"
SESSION="${OPENCLAW_OP_TMUX_SESSION:-op-auth-main}"
WORKDIR="/Users/yixiao/.openclaw/workspace"
RUNTIME_FILE="${EVHOME_RUNTIME_CREDENTIALS_FILE:-$WORKDIR/secret/evhome_runtime.json}"
TMUX_TARGET="$SESSION":0.0

LOCAL_RUN_CMD="cd $WORKDIR && node scripts/evhome_export_all.js && node scripts/lark_match_all.js && DRY_RUN=false node scripts/lark_update_all.js"
TMUX_RUN_CMD="cd $WORKDIR && export EVHOME_OUTPUT=$WORKDIR/output/evhome_all_projects.json && node scripts/evhome_export_all.js && node scripts/lark_match_all.js && DRY_RUN=false node scripts/lark_update_all.js"

if [[ -n "${EVHOME_USERNAME:-}" && -n "${EVHOME_PASSWORD:-}" ]]; then
  bash -lc "$LOCAL_RUN_CMD"
  exit 0
fi

if [[ -f "$RUNTIME_FILE" ]]; then
  export EVHOME_RUNTIME_CREDENTIALS_FILE="$RUNTIME_FILE"
  bash -lc "$LOCAL_RUN_CMD"
  exit 0
fi

if ! tmux -S "$SOCKET" has-session -t "$SESSION" 2>/dev/null; then
  echo "Missing tmux session $SESSION on $SOCKET, and no local EVHOME runtime credentials were found at $RUNTIME_FILE." >&2
  echo "Create secret/evhome_runtime.json or run scripts/op_tmux_init.sh and sign in with op inside tmux first." >&2
  exit 1
fi

tmux -S "$SOCKET" send-keys -t "$TMUX_TARGET" C-c
sleep 0.2
tmux -S "$SOCKET" send-keys -t "$TMUX_TARGET" "$TMUX_RUN_CMD" Enter
sleep 1

tmux -S "$SOCKET" capture-pane -p -J -t "$TMUX_TARGET" -S -200
