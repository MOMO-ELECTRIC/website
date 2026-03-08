# evhome automation (first pass)

This script logs into `https://evhome.sce.com/`, reads the dashboard table, and exports rows whose status is `Paid`.

## Requirements

- Google Chrome installed
- OpenClaw browser profile already running (`cdpPort` normally `18800`)
- 1Password CLI available and signed in via tmux per the 1Password skill
- Node.js available
- `npm install` run once in the workspace

## Install dependencies

```bash
cd ~/.openclaw/workspace
npm install
```

## 1Password item expectations

Default item title:

```text
evhome / SCE program
```

Default fields the script reads:

- `username`
- `password`

If your item uses different names, override them with env vars below.

## Run

```bash
cd ~/.openclaw/workspace
npm run evhome:paid
```

## Useful environment variables

```bash
export EVHOME_OP_ITEM='evhome / SCE program'
export EVHOME_OP_USERNAME_FIELD='username'
export EVHOME_OP_PASSWORD_FIELD='password'
export OPENCLAW_CDP_URL='http://127.0.0.1:18800'
export EVHOME_OUTPUT='output/evhome_paid_projects.json'
```

## Temporary fallback without 1Password

```bash
export EVHOME_USERNAME='your-login-email'
export EVHOME_PASSWORD='your-password'
npm run evhome:paid
```

## Output

Default output file:

```text
output/evhome_paid_projects.json
```

If login succeeds but the dashboard is not detected, debug artifacts are written to:

```text
output/debug/
```

## Notes

- This is a first pass and expects the dashboard to show a standard applications table after login.
- If evhome changes selectors, the script may need adjustment.
- The script now saves a screenshot + HTML dump when login lands on an unexpected page.
- The script prefers connecting to the OpenClaw-managed Chrome CDP endpoint and falls back to launching Chrome directly.
