
create or replace function public.validate_leaderboard_entry()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if length(new.player_name) < 1 or length(new.player_name) > 32 then
    raise exception 'player_name must be 1..32 chars';
  end if;
  if length(new.driver_id) > 64 or length(new.track_id) > 64 or length(new.weather_id) > 64 then
    raise exception 'id fields too long';
  end if;
  if new.best_lap <= 0 or new.best_lap > 600 then
    raise exception 'best_lap out of range';
  end if;
  if new.race_time_sec <= 0 or new.race_time_sec > 7200 then
    raise exception 'race_time_sec out of range';
  end if;
  if new.position < 1 or new.position > 32 then
    raise exception 'position out of range';
  end if;
  return new;
end $$;
