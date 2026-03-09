#!/bin/bash
set -euo pipefail

ROOT="/Users/yixiao/.openclaw/workspace"
cd "$ROOT"

ITEM="${EVHOME_OP_ITEM:-apply.evhome.sce.com (apply@momoelec.com)}"
USERNAME_FIELD="${EVHOME_OP_USERNAME_FIELD:-username}"
PASSWORD_FIELD="${EVHOME_OP_PASSWORD_FIELD:-password}"
OUTPUT="${EVHOME_OUTPUT:-$ROOT/output/evhome_all_projects.json}"

exec bash "$ROOT/scripts/op_tmux_run.sh" bash -lc '
  set -euo pipefail
  export EVHOME_USERNAME="$(op item get "$0" --fields="$1" --reveal)"
  export EVHOME_PASSWORD="$(op item get "$0" --fields="$2" --reveal)"
  export EVHOME_OUTPUT="$3"
  cd "$4"
  node scripts/evhome_export_all.js
' "$ITEM" "$USERNAME_FIELD" "$PASSWORD_FIELD" "$OUTPUT" "$ROOT"
