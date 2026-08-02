// Server-only guard for /api/public/hooks/* cron endpoints.
// pg_cron calls these with the project's publishable/anon key in the `apikey`
// header; anonymous callers without it are rejected.
export function isAuthorizedCronRequest(request: Request): boolean {
  const expected =
    process.env['SUPABASE_PUBLISHABLE_KEY'] ??
    process.env['SUPABASE_ANON_KEY'] ??
    process.env['VITE_SUPABASE_PUBLISHABLE_KEY'];
  if (!expected) return false;

  const provided =
    request.headers.get('apikey') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
