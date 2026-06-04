DROP VIEW IF EXISTS public.server_announcements_public;

GRANT SELECT (id, message, created_at) ON public.server_announcements TO anon, authenticated;

CREATE POLICY "Announcements messages are public"
ON public.server_announcements FOR SELECT
TO anon, authenticated
USING (true);