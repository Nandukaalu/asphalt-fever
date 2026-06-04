-- Remove public exposure of author_email on server_announcements
DROP POLICY IF EXISTS "Announcements are public" ON public.server_announcements;
REVOKE SELECT ON public.server_announcements FROM anon;
REVOKE SELECT ON public.server_announcements FROM authenticated;

-- Safe public view without author_email
CREATE OR REPLACE VIEW public.server_announcements_public
WITH (security_invoker = true) AS
SELECT id, message, created_at
FROM public.server_announcements;

GRANT SELECT ON public.server_announcements_public TO anon, authenticated;

-- Allow authenticated users to read the safe columns through the view only.
-- Table itself remains accessible only to service_role (admin server fns).
CREATE POLICY "Announcements readable via view"
ON public.server_announcements FOR SELECT
TO authenticated
USING (false);
