# Task rebuild-flow-wizard — main agent

## Task
Rebuild `src/components/dashboard/create-flow-dialog.tsx` as a complete 5-step wizard with file upload and knowledge processing integration.

## Context Reviewed
- Read `/home/z/my-project/worklog.md` to understand project history (PayFlow SMT, Next.js 16 + TS + Tailwind + shadcn/ui).
- Previous worklog mentioned a 5-step wizard existed but was lost (sandbox reset); the file in the repo was the OLD 2-step version (280 lines).
- Existing APIs verified:
  - `POST /api/knowledge/process` — accepts `{ sources: [...] }`, returns `{ merged, promptBlock, results }`.
  - `POST /api/knowledge/import` — accepts `ImportPayload` with `_approved`/`_ignored` per item.
  - `POST /api/knowledge/recommend` — accepts `{ detected, paymentRequired?, reservationPayment? }`, returns `RecommendedTemplate` + `suggested_config`.
  - `POST /api/workflows/create-from-template` — accepts the base `FlowTemplateParams` plus extra fields (silently ignored by current route).
- `src/lib/file-content-reader.ts` exposes `readFileContent(file, sourceId)` (client-side, dynamic import of `xlsx` with text fallback).
- `src/lib/knowledge-processor.ts` returns `DetectedKnowledge` with the shape used in the wizard.
- `src/lib/knowledge-recommender.ts` returns `RecommendedTemplate` with `confidence_score`, `reason`, `missing_data`, `suggested_config`.

## Files Modified
- `src/components/dashboard/create-flow-dialog.tsx` — full rewrite (280 → 2246 lines).

## Implementation Highlights

### Architecture (single self-contained file)
- `"use client"` directive.
- Imports only from: `@/components/ui/*`, `lucide-react`, `sonner`, `@/lib/utils`, React hooks/types.
- `readFileContent` is dynamically imported inside `processKnowledge()` to lazy-load `xlsx`.

### Sub-components defined inline
1. `StepIndicator` — numbered circles + connectors + checkmarks.
2. `ImportPreviewModal` — nested Dialog with 5 detected-knowledge sections (Productos, Servicios, Horarios, FAQs, Políticas). Uses the canonical "store info from previous render" React pattern (NOT `useEffect`) to initialize `local` from `detected` prop — avoids the `react-hooks/set-state-in-effect` lint error.
3. `DetectedSection` — header + per-section approve-all/ignore-all in edit mode.
4. `DetectedItem` — item card with approve/ignore checkbox.
5. `PreviewStat`, `DetectedCard`, `ModuleSwitch`, `SummaryRow` — small UI helpers.

### 5 steps
- **Step 1 — Plantilla**: 6 template cards; applies module presets on click. Recommendation banner (purple) appears after `/api/knowledge/recommend` returns.
- **Step 2 — Negocio**: 7 fields (business_name*, business_type, product_or_service, welcome_message, whatsapp_number*, business_hours, agent_tone Select).
- **Step 3 — Conocimiento**: drag-drop upload + manual info (11 fields) + detected-knowledge preview with stats and missing-data warning.
- **Step 4 — Módulos**: 3 module Switches + payment config (conditional on PayPhone) + agent mode Select.
- **Step 5 — Resumen**: 4 summary rows + confirmation + "Crear flujo" button.

### Knowledge flow
1. User uploads files + fills manual fields.
2. Clicks "Procesar conocimiento" → reads files client-side via `readFileContent`, sends all sources (files + manual text) to `/api/knowledge/process`.
3. `merged` DetectedKnowledge opens `ImportPreviewModal`.
4. User can Edit (toggle per-item approve/ignore), Confirm, or Ignore.
5. Confirm → `/api/knowledge/import` (best-effort, `knowledgeOnly: true`) + `/api/knowledge/recommend`. Recommendation stored in state.
6. Returning to Step 1 shows the recommendation banner with "Aplicar: {template}" button.

### Submit
- POSTs to `/api/workflows/create-from-template` with: templateId, projectId, business fields, all 11 manual knowledge fields, knowledge_files metadata, detected_knowledge, payment config, agent_mode.
- On success: reset + `onCreated(workflow_id, project_id)`.
- All API calls wrapped in try/catch with `toast` notifications.

### Robustness
- Failed file reads mark file as "error" and continue with others.
- Failed `/api/knowledge/import` → toast warning, flow continues.
- Failed `/api/knowledge/recommend` → silent, no banner shown.
- All state reset on dialog close (setTimeout 150ms to allow close animation).
- File validation: type (pdf/excel/csv/txt) + size (max 10MB) with toasts.

## Verification
- `bun run lint` → clean (0 errors, 0 warnings). ✓
- `bunx tsc --noEmit` → 0 errors in `create-flow-dialog.tsx` (pre-existing errors in `schedule.ts`, `commercial-agent.ts`, `file-content-reader.ts`, `knowledge-import.ts`, `knowledge-processor.ts` remain — unchanged by this task). ✓
- `curl /home` → HTTP 200 ✓
- `curl /dashboard` → HTTP 200 ✓ (compile + render successful)
- Pre-existing warning: `xlsx` module not found (in `file-content-reader.ts:171`, not in my code). The catch block in `readExcel` falls back to reading the file as text, so Excel files are processed (without row-level parsing) without crashing.

## Notes for next agents
- The current `/api/workflows/create-from-template` route only reads the base `FlowTemplateParams` fields; the extra knowledge fields I send (`business_info`, `agent_tone`, `detected_knowledge`, `knowledge_files`, etc.) are accepted by the route (no validation rejects them) but not yet persisted into the AI system prompt. If a future task wants those fields to actually influence the generated flow, extend `FlowTemplateParams` and the route's `params` construction.
- `xlsx` is not installed in `package.json`. Excel parsing falls back to text. If real Excel row parsing is needed, run `bun add xlsx`.
- The `ImportPreviewModal` uses `knowledgeOnly: true` when calling `/api/knowledge/import` because there's no `clientId` available at workflow-creation time. After the workflow is created, a follow-up call could re-import with the real `clientId`/`workflowId` to populate the catalog/agenda tables.
