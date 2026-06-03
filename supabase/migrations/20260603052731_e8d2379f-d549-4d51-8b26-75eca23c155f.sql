-- 1) Wipe leaderboard
TRUNCATE TABLE public.leaderboard_entries;

-- 2) Server announcements (admin-only writes, public reads)
CREATE TABLE IF NOT EXISTS public.server_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL,
  author_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.server_announcements TO anon, authenticated;
GRANT ALL ON public.server_announcements TO service_role;

ALTER TABLE public.server_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Announcements are public"
  ON public.server_announcements FOR SELECT
  USING (true);

-- writes happen via service_role from server functions; no insert policy needed for client

-- 3) Tighten leaderboard validator: stricter bounds + dedupe identical submissions within 10s
CREATE OR REPLACE FUNCTION public.validate_leaderboard_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  if length(new.player_name) < 1 or length(new.player_name) > 32 then
    raise exception 'player_name must be 1..32 chars';
  end if;
  if length(new.driver_id) > 64 or length(new.track_id) > 64 or length(new.weather_id) > 64 then
    raise exception 'id fields too long';
  end if;
  -- realistic bounds: lap >= 8s, race >= 10s
  if new.best_lap < 8 or new.best_lap > 600 then
    raise exception 'best_lap out of range (8..600s)';
  end if;
  if new.race_time_sec < 10 or new.race_time_sec > 7200 then
    raise exception 'race_time_sec out of range (10..7200s)';
  end if;
  if new.position < 1 or new.position > 32 then
    raise exception 'position out of range';
  end if;
  -- race time must be at least best_lap (sanity)
  if new.race_time_sec < new.best_lap then
    raise exception 'race_time_sec cannot be less than best_lap';
  end if;
  -- dedupe: reject exact-duplicate submission from same player on same track within 10s
  if exists (
    select 1 from public.leaderboard_entries e
    where e.player_name = new.player_name
      and e.track_id = new.track_id
      and e.best_lap = new.best_lap
      and e.race_time_sec = new.race_time_sec
      and e.created_at > now() - interval '10 seconds'
  ) then
    raise exception 'duplicate submission rejected';
  end if;
  return new;
end $function$;

-- 4) Attach trigger (was missing per db-triggers list)
DROP TRIGGER IF EXISTS validate_leaderboard_entry_trg ON public.leaderboard_entries;
CREATE TRIGGER validate_leaderboard_entry_trg
  BEFORE INSERT ON public.leaderboard_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_leaderboard_entry();