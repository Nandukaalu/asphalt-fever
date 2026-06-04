DROP POLICY IF EXISTS "Announcements are public" ON public.server_announcements;
REVOKE SELECT ON public.server_announcements FROM anon;
REVOKE SELECT ON public.server_announcements FROM authenticated;

CREATE OR REPLACE VIEW public.server_announcements_public AS
SELECT id, message, created_at
FROM public.server_announcements;

GRANT SELECT ON public.server_announcements_public TO anon, authenticated;