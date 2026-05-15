import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Sign in — Asphalt Fever" }] }),
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && user) navigate({ to: "/play" }); }, [user, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const cleaned = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (cleaned.length < 3) { toast.error("Username must be 3+ chars (a-z, 0-9, _)"); return; }
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/play`, data: { username: cleaned, display_name: cleaned } },
        });
        if (error) throw error;
        toast.success("Check your inbox to verify your email.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/play" });
      }
    } catch (err: any) { toast.error(err.message ?? "Auth failed"); }
    finally { setBusy(false); }
  };

  const google = async () => {
    setBusy(true);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/play` });
    if (r.error) { toast.error(r.error.message ?? "Google sign-in failed"); setBusy(false); return; }
    if (r.redirected) return;
    navigate({ to: "/play" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-md bg-zinc-950 border border-white/10 p-8">
        <Link to="/" className="text-xs text-white/50 hover:text-white tracking-widest uppercase">← Back</Link>
        <h1 className="mt-4 text-3xl font-black uppercase tracking-tight text-white font-display">{mode === "login" ? "Sign In" : "Create Account"}</h1>
        <p className="mt-1 text-white/50 text-sm">Race friends, track stats, climb the ranks.</p>

        <button onClick={google} disabled={busy}
          className="mt-6 w-full bg-white text-black font-bold py-2.5 hover:bg-white/90 disabled:opacity-50">
          Continue with Google
        </button>
        <div className="my-4 flex items-center gap-3 text-white/30 text-xs uppercase tracking-widest">
          <div className="flex-1 h-px bg-white/10"/>or<div className="flex-1 h-px bg-white/10"/>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input value={username} onChange={e => setUsername(e.target.value)} required maxLength={32}
              placeholder="Username" className="w-full bg-black/60 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-red-500"/>
          )}
          <input value={email} onChange={e => setEmail(e.target.value)} required type="email"
            placeholder="Email" className="w-full bg-black/60 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-red-500"/>
          <input value={password} onChange={e => setPassword(e.target.value)} required type="password" minLength={6}
            placeholder="Password" className="w-full bg-black/60 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-red-500"/>
          <button disabled={busy} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 uppercase tracking-widest disabled:opacity-50">
            {busy ? "..." : mode === "login" ? "Sign In" : "Sign Up"}
          </button>
        </form>

        <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="mt-4 w-full text-white/60 hover:text-white text-sm">
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
