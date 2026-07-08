# Plan: Database + Auth with Role-Based Access

## 1. Enable Lovable Cloud
Provisions the backend (Postgres, auth, storage) with zero external accounts.

## 2. Database schema (migration)
Create these tables in `public`, each with GRANTs and RLS enabled:

- `profiles` — `id (uuid, PK, FK auth.users on delete cascade)`, `display_name`, `created_at`. Auto-created on signup via trigger.
- `app_role` enum: `admin`, `viewer`.
- `user_roles` — `(user_id, role)` with unique constraint. First signed-up user is auto-promoted to `admin`; subsequent users default to `viewer`.
- `has_role(uuid, app_role)` security-definer function (standard safe pattern).
- `organisations` — id, name, location, created_at.
- `buildings` — id, organization_id (FK), custom_display_name, csv_matched_name, address, created_at.
- `consumption_rows` — mirrors current `ConsumptionRow` (half-hourly values as `numeric[]`, dates, meter fields, org/building FKs).
- `meter_overrides` — mirrors current `MeterOverride` (composite PK on raw_meter_name + organization_id).
- `schedules` — id, building_id, name, day, from_time, to_time, months (int[]), created_at.
- `schema_labels` — key/label (single row-per-key, shared).
- `ingestion_settings` — singleton row.

### RLS policies (Admins manage, others view)
For every data table:
- `SELECT` → `TO authenticated USING (true)` (all signed-in users read shared data).
- `INSERT / UPDATE / DELETE` → `TO authenticated USING (public.has_role(auth.uid(), 'admin'))`.
- `profiles`: user can read all, update only their own.
- `user_roles`: users read their own; only admins insert/delete.

## 3. Auth surface
- `/auth` public route: email + password sign-in / sign-up (tabs), with the standard `onAuthStateChange` + `getSession` pattern and `emailRedirectTo: window.location.origin`.
- Integration-managed `_authenticated` layout guards `/admin` and `/apps/*`; `/` remains public and shows a "Sign in" CTA when signed out.
- Root subscribes to `onAuthStateChange` (filtered to SIGNED_IN/OUT/USER_UPDATED) and invalidates the router.
- Header (`AppShell`) shows the signed-in user's email + Sign out; Settings link only when `has_role('admin')`.

## 4. Replace `DataStoreProvider` with Supabase-backed store
- Keep the same `useDataStore` / `useOrganisations` / `useBuildings` / `useConsumption` / `useMeterOverrides` / `useMeterRegistry` / `useSchedules` hook API so existing components don't change.
- Under the hood: TanStack Query keys per entity, subscribed to Supabase realtime (or manual invalidation on mutation). Mutations call Supabase directly from the browser client (RLS enforces admin-only writes).
- Viewers get read-only UI: admin action buttons (Add / Edit / Delete / CSV upload / Reset) are hidden or disabled based on `has_role('admin')` from a `useIsAdmin()` hook.
- `localStorage` state is discarded — the old `STORAGE_KEY` is not read.

## 5. Toasts + error handling
Wire Supabase errors into the existing toast pattern (RLS denials become "You need admin access" messages).

## Out of scope
- No Google/Apple sign-in (email + password only, per your choice).
- No per-user data isolation (data is shared).
- No migration of existing browser data.

## Notes for the technical reviewer
- Roles live in a separate `user_roles` table (never on `profiles`) and are checked via a security-definer `has_role` function to avoid RLS recursion.
- Every `CREATE TABLE public.*` migration includes explicit `GRANT` statements for `authenticated` (and `service_role`) before `ENABLE ROW LEVEL SECURITY`.
- Client-side admin checks are UX only; the real enforcement is RLS on the database.
