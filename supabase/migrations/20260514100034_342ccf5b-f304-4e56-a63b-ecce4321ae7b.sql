
create table public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  player_name text not null,
  driver_id text not null,
  track_id text not null,
  weather_id text not null,
  best_lap numeric not null,
  race_time_sec numeric not null,
  position int not null,
  won boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.leaderboard_entries enable row level security;

create policy "Public can view leaderboard"
  on public.leaderboard_entries for select
  using (true);

create policy "Anyone can submit a result"
  on public.leaderboard_entries for insert
  with check (true);

create or replace function public.validate_leaderboard_entry()
returns trigger language plpgsql as $$
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

create trigger validate_leaderboard_entry_trg
before insert on public.leaderboard_entries
for each row execute function public.validate_leaderboard_entry();

create index leaderboard_track_lap_idx on public.leaderboard_entries (track_id, best_lap asc);
create index leaderboard_created_at_idx on public.leaderboard_entries (created_at desc);

alter publication supabase_realtime add table public.leaderboard_entries;
