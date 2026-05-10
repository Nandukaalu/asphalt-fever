import { createFileRoute } from "@tanstack/react-router";
import RacingGame from "@/components/RacingGame";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Apex GP — F1 Cockpit Racing" },
      { name: "description", content: "Drive an F1-style car from the cockpit. Throttle, brake, and chase your best lap on a flowing circuit." },
    ],
  }),
});

function Index() {
  return <RacingGame />;
}
