import { createFileRoute, Link } from "@tanstack/react-router";
import RacingGame from "@/components/RacingGame";

export const Route = createFileRoute("/play")({
  component: PlayPage,
  head: () => ({
    meta: [
      { title: "Play — Asphalt Fever" },
      { name: "description", content: "Jump into the cockpit and chase the perfect lap in Asphalt Fever." },
    ],
  }),
});

function PlayPage() {
  return (
    <div className="relative">
      <Link
        to="/"
        className="fixed top-3 left-3 z-50 glass tap-target px-4 py-2 rounded-full text-xs font-display tracking-widest uppercase hover:shadow-neon transition-all"
      >
        ← Home
      </Link>
      <RacingGame />
    </div>
  );
}