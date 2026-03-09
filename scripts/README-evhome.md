# evhome automation

This script logs into `https://apply.evhome.sce.com/`, reads the dashboard table, and exports EVHOME applications.

## Credential flow

Routine runs now prefer a local runtime credential file and only fall back to 1Password when local credentials are absent.

Priority order:

1. `EVHOME_USERNAME` + `EVHOME_PASSWORD`
2. `secret/evhome_runtime.json` (or `EVHOME_RUNTIME_CREDENTIALS_FILE`)
3. 1Password CLI via `op`

Recommended local runtime file:

```json
{
  "username": "apply@momoelec.com",
  "password": "replace-me"
}
```

Default path:

```text
secret/evhome_runtime.json
```

A safe template is tracked at:

```text
secret/evhome_runtime.example.json
```

## Requirements

- Google Chrome installed
- OpenClaw browser profile already running (`cdpPort` normally `18800`)
- Node.js available
- `npm install` run once in the workspace
- For 1Password fallback only: 1Password CLI available and signed in via tmux per the 1Password skill

## Install dependencies

```bash
cd ~/.openclaw/workspace
npm install
```

## Run

Run the direct scripts; they already prefer env/local runtime credentials and only hit 1Password if needed:

```bash
cd ~/.openclaw/workspace
npm run evhome:paid
npm run evhome:all
```

Compatibility wrappers still work and now also prefer the local runtime file before tmux/1Password:

```bash
cd ~/.openclaw/workspace
npm run evhome:paid:1p
npm run evhome:all:1p
```

## Useful environment variables

```bash
export EVHOME_RUNTIME_CREDENTIALS_FILE='secret/evhome_runtime.json'
export EVHOME_OP_ITEM='apply.evhome.sce.com (apply@momoelec.com)'
export EVHOME_OP_USERNAME_FIELD='username'
export EVHOME_OP_PASSWORD_FIELD='password'
export OPENCLAW_CDP_URL='http://127.0.0.1:18800'
export EVHOME_OUTPUT='output/evhome_paid_projects.json'
```

## Temporary env override

```bash
export EVHOME_USERNAME='your-login-email'
export EVHOME_PASSWORD='your-password'
npm run evhome:paid
```

## Output

Default files:

```text
output/evhome_projects.json
output/evhome_all_projects.json
```

The export payload now records which credential source was used (`env`, `runtime-file`, `1password`, or `session`) without writing the secret values themselves.

If login succeeds but the dashboard is not detected, debug artifacts are written to:

```text
output/debug/
```

## EVHOME → Lark Base sync path

`scripts/run_evhome_to_larkbase.sh` now follows the same credential preference order:

1. `EVHOME_USERNAME` + `EVHOME_PASSWORD`
2. `secret/evhome_runtime.json`
3. tmux-backed 1Password session

That means routine sync runs no longer require a live `op` session once the local runtime file is in place.

## Notes

- This flow expects the dashboard to show a standard applications table after login.
- If evhome changes selectors, the script may need adjustment.
- The script saves a screenshot + HTML dump when login lands on an unexpected page.
- The script prefers connecting to the OpenClaw-managed Chrome CDP endpoint and falls back to launching Chrome directly.
- `secret/*.json` is ignored by git so the runtime credential file stays local.
