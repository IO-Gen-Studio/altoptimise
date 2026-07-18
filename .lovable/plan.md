# User Management & Access Control

## 1. Hide self-signup on `/auth`

- Remove the "Create account" tab from `src/routes/auth.tsx`; sign-in only.
- Also flip Cloud auth setting `disable_signup: true` so nobody can hit the endpoint directly.

## 2. Expand role model

Replace the current `app_role` enum (`admin | viewer`) with three roles:

- `super_admin` — full access, every organisation, every mini-app.
- `admin` — full functionality but scoped to assigned organisations; can manage users within those orgs.
- `user` — viewer-only, scoped to assigned organisations and assigned mini-apps.

Migration:

- `ALTER TYPE app_role ADD VALUE 'super_admin'` / `'user'`. Existing `admin` rows stay admin; keep `viewer` as a deprecated alias mapped to `user` in code, or migrate rows to `'user'` in the same migration.
- Add helper `is_super_admin(uuid)` (SECURITY DEFINER) for RLS.
- Backfill: the first existing admin becomes `super_admin` (or all current admins → super_admin — see Question 1).

New tables (all with GRANTs + RLS + `updated_at` triggers):

- `user_organisations (user_id, organisation_id)` — many-to-many, PK on the pair.
- `user_app_access (user_id, app_slug)` — many-to-many; `app_slug` is a text matching `APPS[].slug` in `launcher-context.tsx`. Super admins & admins implicitly have all apps; rows only meaningful for `user` role.

RLS updates:

- `organisations`, `buildings`, `consumption_rows`, `meter_overrides`, `schedules`, `ingestion_schedules`: allow row if `is_super_admin(auth.uid())` OR org is in caller's `user_organisations`. Writes further gated by role (`super_admin` or `admin`).
- `user_roles`, `user_organisations`, `user_app_access`, `profiles` (of others): read/write only by super_admin, or admin for users whose org set overlaps theirs.

## 3. Server functions for user CRUD

New `src/lib/users.functions.ts` (client-safe, `.handler()` bodies dynamically import `client.server`):

- `listUsers` — returns profile + email (from `auth.users` via admin client) + role + org ids + app slugs. Admin sees only users sharing at least one of their orgs.
- `createUser({ email, password, displayName, role, organisationIds, appSlugs })` — uses `supabaseAdmin.auth.admin.createUser({ email_confirm: true })`, then inserts into `profiles`, `user_roles`, `user_organisations`, `user_app_access`. Admins cannot create super_admins and can only assign orgs they belong to.
- `updateUser({ userId, displayName?, role?, organisationIds?, appSlugs?, password? })` — password is optional; when omitted, current password is retained (no call to `updateUserById({ password })`). Email is not editable in v1.
- `deleteUser({ userId })` — `supabaseAdmin.auth.admin.deleteUser`; cascades via FKs.
- All functions use `.middleware([requireSupabaseAuth])`, verify caller role via `context.supabase.rpc('has_role', ...)`, then load `supabaseAdmin` inside the handler.

## 4. Users management page

- Activate the existing "Users" sidebar item; route `src/routes/_authenticated/users.tsx`, gated to `super_admin` and `admin` (viewers see access-required card, same pattern as Settings).
- Table columns: Name, Email, Role, Organisations (chip list), App access (chip list, or "All" for admin/super), Actions (Edit, Delete).
- Toolbar: search + "Add user" button.
- `AddUserDialog` / `EditUserDialog` (shared component in `src/components/admin/UserFormDialog.tsx`):
  - Fields: Display name, Email (create only), Role (select — admin cannot pick super_admin), Organisations (multi-select checkbox list — admin limited to own orgs), App access (multi-select of `APPS`; disabled + shown as "All apps" when role is super_admin/admin), Password.
  - Password row: text input + "Generate" button (16-char cryptographically random, mix of upper/lower/digits/symbols) + copy-to-clipboard + show/hide toggle. In edit mode the field is empty with helper text "Leave blank to keep current password".
  - Confirm delete via `AlertDialog`.
- Toast feedback for every action.

## 5. Enforce access elsewhere

- `LauncherProvider` (`src/lib/launcher-context.tsx`): resolve `role` from the new enum, filter `orgs` to `user_organisations`, expose `allowedAppSlugs`; `canAccess(app, role, allowedAppSlugs)` becomes the single gate.
- Sidebar Settings item: visible for `super_admin` and `admin` (admin lands in a scoped view — see Question 2).
- `/apps/$slug`: keep existing lock card, checking the new gate.

## Technical notes

- Password generation runs client-side using `crypto.getRandomValues`; server also validates length ≥ 12.
- `updateUser` re-uses `supabaseAdmin.auth.admin.updateUserById` and passes `password` only when a non-empty value is supplied — this is what preserves the current password.
- Existing seed super-admin flow in `handle_new_user` (first user becomes admin) stays for bootstrap but we relabel to `super_admin`.

## Questions before implementing

1. Existing users with role `admin` today — promote all of them to `super_admin`, or only the very first account and demote the rest to the new `admin`? Only the very first account. 
2. Should `admin` (org-scoped) see the Settings page too (buildings/meters/schedules/ingestion) for their assigned orgs, or is Settings super_admin-only and admins only get the Users page + mini-apps? Should see settings page too for assigned organisation
3. Should admins be able to create other admins, or only `user` accounts? Both yes