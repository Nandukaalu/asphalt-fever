import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_EMAIL = "paarth376@gmail.com";

async function assertAdmin(claims: any): Promise<string> {
  const claimEmail = (claims?.email as string | undefined)?.toLowerCase();
  if (claimEmail && claimEmail === ADMIN_EMAIL) return claimEmail;
  // Fallback: look up via admin client if email isn't in the JWT claims
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const userId = claims?.sub as string | undefined;
  if (!userId) throw new Error("Forbidden");
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) throw new Error("Forbidden");
  const email = data.user.email.toLowerCase();
  if (email !== ADMIN_EMAIL) throw new Error("Forbidden: admin only");
  return email;
}

export const adminCheck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin((context as any).claims);
    return { ok: true as const };
  });

export const adminResetLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin((context as any).claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, count } = await supabaseAdmin
      .from("leaderboard_entries")
      .delete({ count: "exact" })
      .gte("best_lap", 0);
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });

export const adminPurgeInvalid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin((context as any).claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Delete entries that violate the new sanity bounds
    const { error, count } = await supabaseAdmin
      .from("leaderboard_entries")
      .delete({ count: "exact" })
      .or("best_lap.lt.8,race_time_sec.lt.10");
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin((context as any).claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profiles, entries, lobbies, members, recent] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("leaderboard_entries").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("race_lobbies").select("id,name,host_id,status,track_id,max_players,created_at").order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("lobby_members").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("leaderboard_entries").select("*").order("created_at", { ascending: false }).limit(25),
    ]);
    return {
      profileCount: profiles.count ?? 0,
      entryCount: entries.count ?? 0,
      memberCount: members.count ?? 0,
      lobbies: lobbies.data ?? [],
      recent: recent.data ?? [],
    };
  });

export const adminAnnounce = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ message: z.string().trim().min(1).max(280) }).parse,
  )
  .handler(async ({ context, data }) => {
    const email = await assertAdmin((context as any).claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, data: row } = await supabaseAdmin
      .from("server_announcements")
      .insert({ message: data.message, author_email: email })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const adminDeleteEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ context, data }) => {
    await assertAdmin((context as any).claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("leaderboard_entries")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });