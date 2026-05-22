
-- 1. Friendships: restrict UPDATE so only the addressee can accept/block a pending request.
DROP POLICY IF EXISTS "Update friendship if party" ON public.friendships;

CREATE POLICY "Addressee responds to request"
ON public.friendships
FOR UPDATE
TO authenticated
USING (auth.uid() = addressee_id AND status = 'pending')
WITH CHECK (auth.uid() = addressee_id AND status IN ('accepted','blocked'));

-- 2. Leaderboard: replace WITH CHECK (true) with a basic sanity check.
DROP POLICY IF EXISTS "Anyone can submit a result" ON public.leaderboard_entries;

CREATE POLICY "Anyone can submit a valid result"
ON public.leaderboard_entries
FOR INSERT
TO public
WITH CHECK (
  length(player_name) BETWEEN 1 AND 32
  AND length(driver_id) BETWEEN 1 AND 64
  AND length(track_id) BETWEEN 1 AND 64
  AND length(weather_id) BETWEEN 1 AND 64
  AND best_lap > 0 AND best_lap <= 600
  AND race_time_sec > 0 AND race_time_sec <= 7200
  AND position BETWEEN 1 AND 32
);

-- 3. Realtime: explicitly deny direct broadcast/presence channel access.
-- The app only uses postgres_changes, which is governed by per-table RLS.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny broadcast and presence access" ON realtime.messages;

CREATE POLICY "Deny broadcast and presence access"
ON realtime.messages
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
