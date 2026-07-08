# Task 4-b — full-stack-developer

## Task
Rewrite `/home/z/my-project/src/app/dashboard/clientes/page.tsx` as a real admin page that lists ClientAccounts and opens a PayPhone configuration dialog per client.

## Files Touched
- `src/app/dashboard/clientes/page.tsx` (rewritten, ~700 lines, `"use client"`)

No other files were modified.

## Implementation Summary
- **List view**: fetches `GET /api/admin/clients` with `credentials: "include"`. Renders a desktop `<table>` (md+) and mobile card list (`<md`) with columns: Negocio, Email, Teléfono, Ciudad, Estado (badge), Proveedor (payphone → violet badge), Acciones.
- **Toolbar**: search input (filters by businessName/email/phone/city/country) + client counter + "Actualizar" button for silent refresh.
- **States**: loading spinner, error card with retry, empty card (distinguishes between "no clients yet" and "no search results").
- **PayPhone dialog**: opened per row via "Ver PayPhone" button. Fetches `GET /api/admin/clients/[id]/payphone`.
  - Shows: Estado PayPhone Business badge (not_configured/in_process/configured/active), Token configurado (Sí/No), StoreID configurado (Sí/No), StoreID últimos 4 (`****1234` masked), Pre-registro (no habilitado / pendiente / enviado / activado / error), Link de prueba (pendiente / generado / error), Notificación externa (no activa / activa).
  - Server env info: Entorno, Modo, Configurado.
  - Security note: tokens, raw_response, and full StoreID are NEVER shown.
- **Actions** (3-button grid):
  1. "Verificar configuración PayPhone" → re-fetches detail.
  2. "Generar link de prueba" → `POST /api/admin/clients/[id]/test-link`; on success shows emerald success box with clickable link (`target=_blank`) + metadata + WhatsApp message: "Te comparto tu link seguro de pago PayPhone. Cuando completes el pago, confirmaremos tu transacción." On error shows rose error box.
  3. "Marcar PayPhone Business activo" → `PATCH /api/admin/clients/[id]/payphone` with `{ markActive: true }`; refreshes detail.
- Each action shows `Loader2` spinner while in-flight.
- **Color policy**: NO indigo or blue as primary. Violet used only for PayPhone accents (badges, dialog icon, action button). Emerald=ok, amber=warn, rose=err, secondary=muted.
- **Responsive**: mobile-first. `p-4 sm:p-6 lg:p-10`. Dialog `sm:max-w-2xl max-h-[90vh] overflow-y-auto`.
- **i18n**: all labels in Spanish.
- **Fetch safety**: all calls use relative paths + `credentials: "include"`. Errors surfaced as friendly text, never raw JSON.

## Verification
- `bun run lint` → 0 errors, 0 warnings.
- `GET /dashboard/clientes` → HTTP 200 (compile 1613ms, render 138ms) — no errors in dev.log.
- Only `src/app/dashboard/clientes/page.tsx` modified. `/dashboard`, `/dashboard/flujos`, `/login`, `/` (landing) untouched.

## Notes for Next Agent
- The dialog depends on three existing API routes (all admin-only, already created in task 2-roles-rbac):
  - `GET /api/admin/clients` → `{ clients: [...] }` with `paymentAccounts` array.
  - `GET /api/admin/clients/[id]/payphone` → `{ client, server, paymentAccount }`.
  - `POST /api/admin/clients/[id]/test-link` → `{ ok, payment_link, message, ... }` or `{ ok: false, error }`.
  - `PATCH /api/admin/clients/[id]/payphone` → accepts `{ markActive: true }` or status updates.
- The page is rendered inside the existing `dashboard/layout.tsx` (sidebar + header). No layout changes needed.
- To test end-to-end, log in as `super_admin` (e.g. admin from `scripts/seed-admin.ts`) and navigate to `/dashboard/clientes`.
