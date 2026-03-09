#!/bin/bash
set -euo pipefail

ROOT="/Users/yixiao/.openclaw/workspace"
cd "$ROOT"

RUNTIME_FILE="${EVHOME_RUNTIME_CREDENTIALS_FILE:-$ROOT/secret/evhome_runtime.json}"
ITEM="${EVHOME_OP_ITEM:-apply.evhome.sce.com (apply@momoelec.com)}"
USERNAME_FIELD="${EVHOME_OP_USERNAME_FIELD:-username}"
PASSWORD_FIELD="${EVHOME_OP_PASSWORD_FIELD:-password}"
OUTPUT="${EVHOME_OUTPUT:-$ROOT/output/evhome_all_projects.json}"

if [[ -n "${EVHOME_USERNAME:-}" && -n "${EVHOME_PASSWORD:-}" ]]; then
  export EVHOME_OUTPUT="$OUTPUT"
  exec node scripts/evhome_export_all.js
fi

if [[ -f "$RUNTIME_FILE" ]]; then
  export EVHOME_RUNTIME_CREDENTIALS_FILE="$RUNTIME_FILE"
  export EVHOME_OUTPUT="$OUTPUT"
  exec node scripts/evhome_export_all.js
fi

exec bash "$ROOT/scripts/op_tmux_run.sh" bash -lc '
  set -euo pipefail
  export EVHOME_USERNAME="$(op item get "$0" --fields="$1" --reveal)"
  export EVHOME_PASSWORD="$(op item get "$0" --fields="$2" --reveal)"
  export EVHOME_OUTPUT="$3"
  cd "$4"
  node scripts/evhome_export_all.js
' "$ITEM" "$USERNAME_FIELD" "$PASSWORD_FIELD" "$OUTPUT" "$ROOT"
