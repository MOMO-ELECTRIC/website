# EVHOME claim package standard

This is the standard layout to reduce EVHOME upload failures and avoid on-the-fly file hunting.

## Goal

For each completed EVHOME project, normalize the local prep folder into one upload-ready package.

## Recommended source folder

Keep the working prep in a per-project folder such as:

- `output/claim_upload_14880_ash/`
- `output/claim_upload_15762_rolling_ridge/`

## Required logical groups

### 1) Itemized Invoice

Expected canonical file in upload package:

- `invoice.pdf`

Typical source files:

- `invoice-951.pdf`
- `invoice-952.pdf`

### 2) Permit

Canonical files in upload package:

- `permit-1.pdf`
- `permit-2.pdf`
- `permit-3.pdf`

Typical source files:

- `permit-panel.pdf`
- `permit-original-panel.pdf`
- `permit-original-ev.pdf`

### 3) Picture of Installed Circuit/Panel

Canonical files in upload package:

- `inspection-report.pdf`
- `panel-photo-1.jpg`
- `panel-photo-2.jpg`
- ...
- `supporting-panel-photo-1.jpg`

Typical source files:

- `inspection-report.pdf`
- `new-panel-1.jpg ... new-panel-N.jpg`
- `old-main-breaker-cropped.jpg`
- `old-main-breaker-original.jpg`

## Upload strategy

To reduce failures:

1. Prepare the full package locally first.
2. Copy it into `/tmp/openclaw/uploads/evhome-claim-packages/<job>/`.
3. Generate a `manifest.json` that tells the uploader which files belong to each EVHOME upload slot.
4. Only then start browser upload work.

## Script

Prepare a normalized package with:

```bash
cd ~/.openclaw/workspace
node scripts/evhome_prepare_claim_package.js output/claim_upload_14880_ash 14880-ash
```

The script writes an upload-ready package to:

```text
/tmp/openclaw/uploads/evhome-claim-packages/14880-ash/
```

And generates:

```text
manifest.json
```

## Why this helps

- Fewer ad-hoc decisions during browser automation
- Stable filenames for upload steps
- Easier recovery after browser/gateway restarts
- Easier auditing of what was actually prepared for a claim
