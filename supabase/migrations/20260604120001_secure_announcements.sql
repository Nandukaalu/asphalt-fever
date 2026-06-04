-- Remove public exposure of author_email on server_announcements
DROP POLICY IF EXISTS "Announcements are public" ON public.server_announcements;
REVOKE SELECT ON public.server_announcements FROM anon;
REVOKE SELECT ON public.server_announcements FROM authenticated;

-- Safe public view exposing only non-sensitive columns (no author_email).
-- security_invoker=false (default): runs with view owner's privileges and bypasses
-- the underlying table's RLS, so the table can stay locked to service_role.
CREATE OR REPLACE VIEW public.server_announcements_public AS
SELECT id, message, created_at
FROM public.server_announcements;

GRANT SELECT ON public.server_announcements_public TO anon, authenticated;
