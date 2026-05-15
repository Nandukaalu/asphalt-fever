
-- PROFILES
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Profiles viewable by authenticated users"
  on public.profiles for select to authenticated using (true);
create policy "Users update own profile"
  on public.profiles for update to authenticated using (auth.uid() = user_id);
create policy "Users insert own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_username text;
  final_username text;
  i int := 0;
begin
  base_username := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'racer'), '[^a-z0-9_]', '', 'g'));
  if length(base_username) < 3 then base_username := 'racer' || substr(new.id::text, 1, 6); end if;
  final_username := base_username;
  while exists (select 1 from public.profiles where username = final_username) loop
    i := i + 1;
    final_username := base_username || i::text;
  end loop;
  insert into public.profiles (user_id, username, display_name)
  values (new.id, final_username, coalesce(new.raw_user_meta_data->>'display_name', final_username));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- FRIENDSHIPS
create type public.friendship_status as enum ('pending', 'accepted', 'blocked');

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
alter table public.friendships enable row level security;

create policy "View own friendships"
  on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "Send friend request"
  on public.friendships for insert to authenticated
  with check (auth.uid() = requester_id);
create policy "Update friendship if party"
  on public.friendships for update to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "Delete friendship if party"
  on public.friendships for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create trigger friendships_updated_at before update on public.friendships
  for each row execute function public.set_updated_at();

-- LOBBIES
create table public.race_lobbies (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  invite_code text not null unique,
  track_id text not null default 'monaco',
  laps int not null default 5,
  weather_id text not null default 'clear',
  status text not null default 'waiting',
  max_players int not null default 8,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.race_lobbies enable row level security;

create table public.lobby_members (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.race_lobbies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (lobby_id, user_id)
);
alter table public.lobby_members enable row level security;

-- Helper to avoid recursive RLS
create or replace function public.is_lobby_member(_lobby uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lobby_members where lobby_id = _lobby and user_id = _user);
$$;

create policy "View lobby if host or member"
  on public.race_lobbies for select to authenticated
  using (auth.uid() = host_id or public.is_lobby_member(id, auth.uid()));
create policy "Host creates lobby"
  on public.race_lobbies for insert to authenticated
  with check (auth.uid() = host_id);
create policy "Host updates lobby"
  on public.race_lobbies for update to authenticated
  using (auth.uid() = host_id);
create policy "Host deletes lobby"
  on public.race_lobbies for delete to authenticated
  using (auth.uid() = host_id);

create policy "View lobby members if in same lobby"
  on public.lobby_members for select to authenticated
  using (public.is_lobby_member(lobby_id, auth.uid()) or exists(select 1 from public.race_lobbies l where l.id = lobby_id and l.host_id = auth.uid()));
create policy "Join lobby as self"
  on public.lobby_members for insert to authenticated
  with check (auth.uid() = user_id);
create policy "Update own membership"
  on public.lobby_members for update to authenticated
  using (auth.uid() = user_id);
create policy "Leave lobby (self) or host kicks"
  on public.lobby_members for delete to authenticated
  using (auth.uid() = user_id or exists(select 1 from public.race_lobbies l where l.id = lobby_id and l.host_id = auth.uid()));

create trigger lobbies_updated_at before update on public.race_lobbies
  for each row execute function public.set_updated_at();

-- Realtime for lobby
alter publication supabase_realtime add table public.race_lobbies;
alter publication supabase_realtime add table public.lobby_members;
alter publication supabase_realtime add table public.friendships;
