#!/bin/bash
set -euo pipefail

SOCKET_DIR="${OPENCLAW_TMUX_SOCKET_DIR:-${CLAWDBOT_TMUX_SOCKET_DIR:-${TMPDIR:-/tmp}/openclaw-tmux-sockets}}"
SOCKET="${OPENCLAW_OP_TMUX_SOCKET:-$SOCKET_DIR/openclaw-op.sock}"
SESSION="${OPENCLAW_OP_TMUX_SESSION:-op-auth-main}"
TARGET="${OPENCLAW_OP_TMUX_TARGET:-$SESSION:0.0}"
TIMEOUT_SECS="${OPENCLAW_OP_TMUX_TIMEOUT_SECS:-300}"
POLL_SECS="${OPENCLAW_OP_TMUX_POLL_SECS:-1}"

mkdir -p "$SOCKET_DIR"

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 64
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required but not installed." >&2
  exit 1
fi

if ! tmux -S "$SOCKET" has-session -t "$SESSION" 2>/dev/null; then
  echo "tmux session not found: $SESSION ($SOCKET)" >&2
  echo "Run: bash scripts/op_tmux_init.sh" >&2
  exit 1
fi

id="OPENCLAW_$(date +%s)_$$"
start_marker="__${id}_START__"
done_prefix="__${id}_DONE__:"
quoted_cmd=$(printf '%q ' "$@")
quoted_cmd=${quoted_cmd% }
remote_script="printf '%s\\n' '$start_marker'; ${quoted_cmd}; __rc=\$?; printf '%s%s\\n' '$done_prefix' \"\$__rc\""

tmux -S "$SOCKET" send-keys -t "$TARGET" C-c
sleep 0.2
tmux -S "$SOCKET" send-keys -t "$TARGET" -- "$remote_script" Enter

deadline=$(( $(date +%s) + TIMEOUT_SECS ))
while true; do
  pane=$(tmux -S "$SOCKET" capture-pane -p -J -t "$TARGET" -S -300 2>/dev/null || true)
  if printf '%s' "$pane" | grep -Fq "$done_prefix"; then
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "Timed out waiting for tmux command to finish" >&2
    exit 124
  fi
  sleep "$POLL_SECS"
done

output=$(printf '%s\n' "$pane" | awk -v start="$start_marker" -v done="$done_prefix" '
  $0 ~ start { capture=1; next }
  index($0, done) == 1 { capture=0; exit }
  capture { print }
')
rc=$(printf '%s\n' "$pane" | awk -v done="$done_prefix" 'index($0, done) == 1 { sub(done, "", $0); print $0; exit }')

printf '%s\n' "$output"
exit "${rc:-1}"
