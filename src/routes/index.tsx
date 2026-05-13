import { createFileRoute } from "@tanstack/react-router";
import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import {
  CarsSection,
  LeaderboardSection,
  GallerySection,
  TestimonialsSection,
  AboutSection,
  CtaSection,
} from "@/components/landing/Sections";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Asphalt Fever — Cinematic 3D Racing" },
      { name: "description", content: "Burn the asphalt. Own the night. A premium 3D cockpit racer with online lobbies, real circuits, and full driver & car customization." },
    ],
  }),
});

function Index() {
  return (
    <div className="bg-background text-foreground">
      <Navbar />
      <Hero />
      <CarsSection />
      <LeaderboardSection />
      <GallerySection />
      <TestimonialsSection />
      <AboutSection />
      <CtaSection />
    </div>
  );
}
