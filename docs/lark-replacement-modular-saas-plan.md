# Lark Replacement Plan for EVHOME Operations

## Executive summary

Tex’s current stack already shows the shape of the future system: EVHOME data is being pulled from the SCE portal, matched back to jobs, written into Lark Base, audited with OCR helpers, and partially synced into calendar workflows. The real problem is that Lark has become both the system of record and the automation bus, which makes complex workflows brittle, hard to customize, and hard to trust.

**Recommendation:** replace Lark gradually with an owned, modular operations platform built around a single relational database, an internal event bus, explicit workflow state machines, and narrow-purpose modules for intake, project ops, delivery evidence, archive verification, analytics, and finance. Keep Lark in a shrinking compatibility role during migration: first as a read/write mirror, then as a read-only archive, then retire it.

**Best MVP path:** start with a new internal database plus three modules only: **Lead Intake + Project Tracker + Delivery Evidence/Archive Verification**, while continuing EVHOME export/import and optional Lark write-back during transition. This gives immediate wins on workflow clarity and reliability without forcing finance or analytics to move too early.

---

## 1) What exists now in the workspace

The workspace shows a real, operating Lark-centered workflow rather than a hypothetical one.

### Current observed Lark usage

- **Lark Base as operational database / CRM substitute**
  - Scripts query and update a Bitable table with fields like `客户姓名`, `客户手机号`, `客户地址`, `客户进度`, `CRH_NO`, `EVHOME_STATUS`, `EVHOME_PREQUAL_ID_OCR`, `施工时间`.
  - Example scripts: `scripts/lark_match_all.js`, `scripts/lark_update_all.js`, `scripts/lark_update_crh.js`, `scripts/lark_backfill_constructed_crh.js`.
- **Lark as workflow coordination layer**
  - Jobs are matched to EVHOME applications by normalized address, then Lark records are updated.
  - Progress changes like paid/submitted are pushed into Lark and sometimes mapped into `客户进度`.
- **Lark as evidence/archive store**
  - Attachments are downloaded from Lark Drive and OCR-audited for prequalification IDs.
  - Example: `scripts/lark_audit_prequal_ocr.js`, `scripts/lark_ocr_prequal_today.js`, `scripts/lark_writeback_prequal_reviewed.js`.
- **Lark calendar as scheduling surface**
  - Construction dates from Bitable are mirrored into a Lark calendar.
  - Example: `scripts/lark_calendar_sync.js`, `scripts/lark_to_calendar.js`.
- **Automation scheduling around Lark**
  - LaunchAgents exist for EVHOME→Lark sync and Lark calendar/user sync.
  - Example plists in `scripts/`.

### Current observed non-Lark systems

- **EVHOME/SCE portal is the external source of truth for rebate application state**
  - Export scripts scrape all or paid projects from `apply.evhome.sce.com`.
  - Claim upload automation exists.
- **Local filesystem is already the practical archive layer**
  - Claim packages, manifests, invoices, permit PDFs, panel photos, and audit outputs are stored locally.
- **1Password/runtime secrets** are used by scripts, which means credentials and integration access are already multi-system, not purely inside Lark.

### Current pain visible from the codebase

1. **Lark is carrying too many responsibilities**: CRM, project tracker, attachment store, automation trigger source, calendar source.
2. **Business logic is outside the data model**: lots of operational rules live in scripts instead of explicit workflows.
3. **Matching is heuristic-heavy**: address normalization and fuzzy matching are necessary because Lark is not the real operational backbone.
4. **Evidence quality is inconsistent**: OCR audit results show many suspicious or weak-confidence records.
5. **Automation is point-to-point**: EVHOME → local JSON → match script → Lark update → calendar sync, instead of evented modules with durable processing.

---

## 2) Target system architecture

### High-level architecture

```text
External systems
- SCE EVHOME portal
- Email / screenshots / docs
- Calendar provider
- Accounting platform

        ↓ connectors / adapters

Owned SaaS application
- Web app / admin UI
- API layer
- Workflow engine / state machines
- Event bus / job queue
- File ingestion + evidence pipeline
- Reporting / analytics service

        ↓

Core platform
- PostgreSQL (system of record)
- Object storage (files, photos, PDFs, OCR artifacts)
- Background workers
- Audit log / outbox / webhooks
- Observability + backups

        ↓ compatibility during migration
- Lark sync adapter (temporary)
- Calendar sync adapter
- EVHOME import/export adapter
- Finance export adapter
```

### Recommended technical stance

- **System of record:** PostgreSQL
- **File storage:** S3-compatible object storage (or equivalent) with immutable object keys
- **Async processing:** queue-based workers (e.g. Postgres-backed jobs, Redis queue, or cloud queue)
- **Integration pattern:** adapter services around EVHOME, calendar, accounting, and temporary Lark sync
- **App design:** modular monolith first, not microservices

### Why modular monolith first

Tex’s operation is workflow-heavy, not internet-scale. The hard part is correctness and operability, not service isolation. A modular monolith gives:

- one deployment target
- one database
- easier reporting across modules
- easier transaction boundaries
- fewer failure modes than a microservice mesh

Split modules later only if one domain becomes operationally independent.

---

## 3) Recommended module boundaries

The boundaries below fit the EV/home-electrical workflow visible in the workspace.

### A. Lead Intake

**Purpose:** capture and qualify inbound opportunities before they become active jobs.

**Responsibilities**
- customer/contact intake
- service address intake
- utility/program eligibility questions
- source attribution
- prequalification request tracking
- duplicate detection

**Should own**
- lead
- contact
- service address
- intake source
- initial qualification status

**Should not own**
- construction execution
- final finance ledger

### B. Project Tracker

**Purpose:** own the lifecycle from approved lead to completed field job.

**Responsibilities**
- project creation
- scheduling
- field milestones
- permit/inspection milestones
- EVHOME application linkage
- assignment to crew / estimator / admin
- exception handling

**Should own**
- project
- job stage
- schedule windows
- dependencies
- blockers
- milestone completion

### C. Delivery Result Collection

**Purpose:** gather the actual proof that work was done and is rebate/claim-ready.

**Responsibilities**
- invoice collection
- permit PDF collection
- panel photo collection
- inspection report collection
- required-doc checklist
- package manifest generation

**Grounding from workspace**
This maps directly to `evhome_prepare_claim_package.js`, `evhome_claim_upload.js`, and the claim package report.

### D. Archive Verification

**Purpose:** verify that the collected evidence is valid, complete, and usable.

**Responsibilities**
- OCR extraction of prequal IDs / claim IDs / CRH references
- document classification
- evidence confidence scoring
- missing-file detection
- human review queue for suspicious cases
- immutable audit trail of what was reviewed

**Grounding from workspace**
This maps directly to the OCR audit flow and is clearly a separate concern from basic storage.

### E. Analytics

**Purpose:** answer operational questions without abusing the transactional system.

**Responsibilities**
- funnel metrics
- stage aging
- install throughput
- claim submission/approval/paid conversion
- attachment completeness rates
- revenue / cash timing dashboards

### F. Finance

**Purpose:** track the money side cleanly, without letting accounting logic leak into project ops.

**Responsibilities**
- invoices
- payouts / reimbursements / rebates
- job costing rollups
- receivables state
- finance exports to accounting tool

### G. Integration Hub

**Purpose:** isolate all external dependencies.

**Responsibilities**
- EVHOME connector
- email/screenshot ingestion
- calendar sync
- temporary Lark mirror
- accounting export/import

**Important rule:** no business logic should live only inside adapters.

---

## 4) Core data model / entities

Use a normalized core model with explicit IDs and foreign keys.

### Core entities

#### Customer
- customer_id
- legal_name / display_name
- preferred_language
- primary_phone
- primary_email
- notes

#### Contact
- contact_id
- customer_id
- name
- role
- phone
- email
- is_primary

#### ServiceAddress
- address_id
- normalized_address
- raw_address
- city
- state
- zip
- utility_territory
- geocode fields (optional later)

#### Lead
- lead_id
- customer_id
- address_id
- source
- program_interest (`panel_upgrade`, `ev_charger`, `both`)
- lead_status
- qualification_summary
- created_at

#### Project
- project_id
- lead_id
- project_number
- project_type
- program_type (`EVHOME`, etc.)
- current_stage
- assigned_owner
- target_install_date
- install_completed_at
- closed_at

#### ProgramApplication
Represents the external rebate/program record.
- program_application_id
- project_id
- external_system (`EVHOME`)
- prequal_id
- crh_no
- external_status
- submitted_at
- approved_at
- paid_at
- external_payload_snapshot

#### ScheduleEvent
- schedule_event_id
- project_id
- type (`site_visit`, `install`, `inspection`, `followup`)
- start_at
- end_at
- assigned_resource
- calendar_sync_state

#### Document
- document_id
- project_id
- category (`invoice`, `permit`, `inspection_report`, `panel_photo`, `email_screenshot`, `portal_screenshot`)
- file_key
- original_filename
- mime_type
- captured_at
- source
- checksum

#### EvidencePackage
This becomes the replacement for ad-hoc claim upload folders.
- evidence_package_id
- project_id
- package_type (`claim_submission`, `archive_bundle`)
- status (`draft`, `ready`, `verified`, `submitted`, `rejected`)
- manifest_json
- generated_at

#### VerificationResult
- verification_result_id
- project_id
- document_id or evidence_package_id
- verifier_type (`ocr`, `rule_engine`, `human_review`)
- result_status (`pass`, `warn`, `fail`)
- confidence
- extracted_prequal_id
- extracted_crh_no
- findings_json

#### FinancialRecord
- financial_record_id
- project_id
- type (`customer_invoice`, `program_rebate`, `vendor_cost`, `adjustment`)
- amount
- status
- due_date / paid_date
- external_accounting_ref

#### ActivityLog / EventLog
- event_id
- aggregate_type
- aggregate_id
- event_type
- payload_json
- actor_type
- actor_id
- occurred_at

### Important derived views

- pipeline_by_stage
- installs_due_this_week
- completed_missing_claim_package
- claim_submitted_not_paid
- suspicious_archive_records
- paid_projects_without_finance_closeout

---

## 5) Project / workflow state machine ideas

Do not use one overloaded status field like `客户进度` for everything. Use a project state machine plus sub-state machines.

### Primary project lifecycle

```text
lead_captured
→ qualified
→ prequal_requested
→ prequal_approved
→ scheduled
→ in_install
→ installed
→ inspection_complete
→ claim_package_ready
→ claim_submitted
→ claim_approved
→ paid
→ closed
```

### Exception states

```text
on_hold
cancelled
rejected
awaiting_customer
awaiting_utility
rework_required
archive_review_required
```

### Sub-state machine: delivery evidence

```text
missing
→ partial
→ complete
→ verified
→ uploaded
→ accepted
```

### Sub-state machine: archive verification

```text
unreviewed
→ auto_verified
→ suspicious_needs_review
→ human_verified
→ rejected_needs_reupload
```

### Sub-state machine: finance

```text
not_invoiced
→ invoiced
→ receivable_open
→ partially_paid
→ paid_out
→ reconciled
```

### Why this matters

Current scripts imply several different concepts are being stuffed together:
- install progress
- EVHOME portal status
- claim readiness
- evidence quality
- payment state

Those should be separate but linked.

---

## 6) Migration phases from Lark to the owned system

### Phase 0 — Stabilize and map the current world

**Goal:** understand Lark as-is before replacing anything.

Actions:
- inventory Lark fields, views, automations, and calendars actually in use
- create field mapping from Lark Base → new schema
- identify authoritative fields vs derived fields
- classify attachments by business meaning
- freeze creation of new “mystery fields” in Lark

Deliverables:
- Lark field/data dictionary
- workflow map
- migration mapping spec

### Phase 1 — Build the new core database and read model

**Goal:** make the owned system the reporting backbone first.

Actions:
- create Postgres schema for customer, address, lead, project, program_application, document, evidence_package, verification_result
- import a snapshot from Lark and EVHOME exports
- create reconciliation reports: counts, IDs, unmatched records, missing fields
- make Lark read-only for reporting consumers where possible

Deliverables:
- daily import job from Lark and EVHOME
- parity dashboard
- exception queue for mismatches

### Phase 2 — Replace new intake and active project creation

**Goal:** stop creating new operational truth in Lark.

Actions:
- new leads created in the owned app
- new projects created in the owned app
- optional Lark mirror writes for visibility only
- staff use the new project board for active jobs

Lark role in this phase:
- compatibility mirror
- legacy search surface
- not authoritative for new records

### Phase 3 — Replace delivery evidence and archive verification

**Goal:** remove the messiest workflow from Lark first.

Actions:
- upload/store all new docs in object storage
- generate evidence packages in the owned app
- run OCR/classification/verification there
- create human review queue for suspicious evidence
- keep only summary fields mirrored to Lark if needed

This phase should deliver major pain relief because archive/evidence work is where Lark is especially weak.

### Phase 4 — Replace project workflow and schedule orchestration

**Goal:** move day-to-day operations off Lark.

Actions:
- scheduling board in owned app
- install/inspection/project states in owned app
- calendar sync becomes adapter-only
- stop using Lark calendar as primary scheduling model

### Phase 5 — Replace finance and analytics

**Goal:** close loop from ops to money.

Actions:
- finance records and payout/rebate states live in owned app
- analytics layer runs from owned DB / warehouse
- accounting exports or API sync added

### Phase 6 — Retire Lark operationally

**Goal:** Lark is archive-only or fully removed.

Actions:
- disable write-backs except optional archival export
- freeze old Lark Base
- export attachments/records for long-term retention
- remove scheduled sync jobs and plists once confidence is high

---

## 7) Automation and event model

Current automation is script-chained. Replace it with durable events.

### Recommended event model

Each important business change emits a domain event.

Examples:
- `lead.created`
- `project.created`
- `program_application.prequal_detected`
- `program_application.crh_matched`
- `schedule.install_set`
- `document.uploaded`
- `evidence_package.generated`
- `verification.failed`
- `claim.submitted`
- `claim.paid`
- `finance.record_created`

### Event processing pattern

Use:
- transactional write to DB
- outbox table for guaranteed event publication
- background worker consumes outbox and performs side effects

This avoids the common failure where data writes succeed but follow-up syncs fail silently.

### Example flows

#### EVHOME sync flow
1. connector imports latest EVHOME applications
2. app matches by deterministic project/program identifiers first, address only as fallback
3. emit `program_application.status_changed`
4. workflow engine advances project if allowed
5. analytics and notifications subscribe

#### Evidence verification flow
1. document uploaded
2. emit `document.uploaded`
3. OCR worker extracts text and identifiers
4. rules engine classifies quality/confidence
5. if suspicious, emit `verification.review_required`
6. human review resolves and app records decision

#### Calendar flow
1. schedule event created or changed
2. emit `schedule.changed`
3. calendar adapter syncs to external calendar
4. sync status stored separately from schedule truth

### Key principle

External sync state must never be the only copy of the truth.

---

## 8) Reliability / ops checklist

This is where the new system should be much better than the current Lark-script mesh.

### Data integrity
- [ ] Postgres backups with restore tests
- [ ] object storage versioning / retention
- [ ] checksums for uploaded files
- [ ] foreign keys on core entities
- [ ] immutable event/audit log
- [ ] soft delete + archival rules

### Workflow safety
- [ ] explicit state transition rules
- [ ] idempotent workers
- [ ] dedupe keys for imports and uploads
- [ ] human review queues for ambiguous OCR/matching
- [ ] retry policy with dead-letter handling

### Integration safety
- [ ] adapter boundary per external system
- [ ] rate limiting/backoff on EVHOME and any remaining Lark calls
- [ ] last-success timestamps for every sync
- [ ] alert on sync lag or repeated failures
- [ ] snapshot of raw upstream payloads for forensic debugging

### Observability
- [ ] structured logs
- [ ] job run history
- [ ] dashboard for queue depth / failures
- [ ] metrics for import counts, match rates, verification pass rate, claim aging
- [ ] audit screen for “why did this record change?”

### Security / access
- [ ] secrets out of source-controlled files
- [ ] per-user auth and permissions
- [ ] least-privilege external credentials
- [ ] document access controls by role
- [ ] retention policy for sensitive screenshots/docs

### Disaster recovery
- [ ] restore DB in staging from backup
- [ ] recover object storage references from DB
- [ ] replay outbox/events after outage
- [ ] documented manual fallback for claim package generation and submission

---

## 9) MVP recommendation

### Best MVP

Build these first:

1. **Core DB + admin UI**
2. **Lead Intake**
3. **Project Tracker**
4. **Delivery Result Collection + Archive Verification**
5. **EVHOME import connector**
6. **Temporary Lark mirror adapter**

### Why this MVP

It attacks the pain points in the right order:
- workflow complexity → fixed by explicit project states
- customization limits → fixed by owned schema/UI
- automation brittleness → fixed by event model and workers
- archive/evidence mess → fixed by evidence package + verification pipeline

### What to postpone

Postpone until after operational adoption:
- deep accounting integration
- full BI warehouse
- customer self-service portal
- mobile app
- multi-tenant architecture
- microservices split

---

## 10) Recommended next steps

### Immediate next 2 weeks

1. Create a **Lark field inventory** and map every actively used field to a proposed owned schema.
2. Build a **read-only Postgres mirror** from Lark + EVHOME exports.
3. Define the **canonical project lifecycle** and stop overloading `客户进度`.
4. Define canonical document categories based on the existing claim package workflow.
5. Set up a **single project detail screen** mockup covering:
   - customer/contact
   - address
   - EVHOME identifiers
   - schedule
   - docs/evidence
   - verification findings
   - finance summary

### Next 30 days

1. Ship MVP database + admin UI.
2. Start creating **new projects in owned system first**.
3. Mirror selected summaries back to Lark for staff continuity.
4. Move OCR verification and claim package generation into the new app.
5. Add exception dashboards for:
   - unmatched EVHOME records
   - suspicious OCR results
   - completed installs with missing package docs
   - claim submitted but not paid aging

### Next 60–90 days

1. Move active scheduling and project board to owned system.
2. Reduce Lark writes to summary-only.
3. Freeze Lark as legacy record archive for older jobs.
4. Add finance closeout and analytics dashboards.
5. Plan final archival export and retirement of Lark automation jobs.

---

## 11) Practical design decisions I would make

- **Use project + program_application as separate entities.** One job may interact with one or more external programs over time.
- **Store files outside the transactional DB.** Keep metadata in Postgres, binaries in object storage.
- **Treat OCR results as evidence, not truth.** Always keep confidence, extracted text snippets, and human override capability.
- **Prefer deterministic identifiers over address matching wherever possible.** Address matching should become fallback, not primary linkage.
- **Use Lark only as a mirror during migration.** If staff still want visibility there, fine — but never let it remain the real source of truth.

---

## 12) Bottom line

The workspace already proves Tex’s business can run with a modular backend: EVHOME ingestion, claim-package prep, OCR review, and schedule sync are already separate concerns. What’s missing is a real core system underneath them.

The right replacement is **not** “another giant all-in-one SaaS.” It is a **small owned operations platform** with a strong data model and narrow modules. Start with the modules that map directly to today’s pain and code:

- intake
- project tracking
- delivery evidence
- archive verification

Then progressively absorb analytics and finance, while Lark shrinks from operational core → compatibility mirror → archive.
