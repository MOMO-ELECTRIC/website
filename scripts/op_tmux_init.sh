#!/bin/bash
set -euo pipefail

SOCKET_DIR="${OPENCLAW_TMUX_SOCKET_DIR:-${CLAWDBOT_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/openclaw-tmux-sockets}}"
SOCKET="${OPENCLAW_OP_TMUX_SOCKET:-$SOCKET_DIR/openclaw-op.sock}"
SESSION="${OPENCLAW_OP_TMUX_SESSION:-op-auth-main}"
ACCOUNT="${OP_ACCOUNT:-${1:-}}"

mkdir -p "$SOCKET_DIR"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required but not installed." >&2
  exit 1
fi

if ! command -v op >/dev/null 2>&1; then
  echo "1Password CLI (op) is required but not installed." >&2
  exit 1
fi

if ! tmux -S "$SOCKET" has-session -t "$SESSION" 2>/dev/null; then
  tmux -S "$SOCKET" new-session -d -s "$SESSION" -n shell
  tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 "cd /Users/yixiao/.openclaw/workspace" Enter
fi

SIGNIN_CMD="op signin"
if [ -n "$ACCOUNT" ]; then
  SIGNIN_CMD="op signin --account $ACCOUNT"
fi

cat <<EOF
OpenClaw 1Password tmux session is ready.

Socket : $SOCKET
Session: $SESSION

Next steps:
1) Attach to the session:
   tmux -S "$SOCKET" attach -t "$SESSION"
2) Inside that session, run:
   $SIGNIN_CMD
3) After approving in the 1Password app/browser, verify:
   op whoami
4) Detach with: Ctrl-b d

After that, future OpenClaw runs can reuse this tmux session without repeating signin each time.
EOF
