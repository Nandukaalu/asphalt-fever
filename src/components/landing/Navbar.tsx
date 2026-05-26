import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "#cars", label: "Cars" },
    { href: "#leaderboard", label: "Leaderboard" },
    { href: "#gallery", label: "Gallery" },
    { href: "#about", label: "About" },
  ];

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${
        scrolled ? "glass border-b border-border/40 py-2" : "py-4"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">
        <Link to="/" className="font-display font-black text-lg sm:text-xl tracking-[0.18em] text-gradient-primary">
          ASPHALT FEVER
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-display uppercase tracking-widest">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="relative text-muted-foreground hover:text-foreground transition-colors after:content-[''] after:absolute after:left-0 after:bottom-[-6px] after:h-[2px] after:w-0 after:bg-primary hover:after:w-full after:transition-all"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/garage"
            className="hidden sm:inline-flex tap-target px-4 items-center rounded-full glass text-xs font-display uppercase tracking-widest hover:shadow-cyan transition-all"
          >
            Garage
          </Link>
          <Link
            to="/freeroam"
            className="hidden sm:inline-flex tap-target px-4 items-center rounded-full glass text-xs font-display uppercase tracking-widest hover:shadow-cyan transition-all"
          >
            Free Roam
          </Link>
          <Link
            to="/customize"
            className="hidden sm:inline-flex tap-target px-4 items-center rounded-full glass text-xs font-display uppercase tracking-widest hover:shadow-cyan transition-all"
          >
            Customize
          </Link>
          <Link
            to="/play"
            className="tap-target px-5 inline-flex items-center rounded-full bg-primary text-primary-foreground text-xs font-display uppercase tracking-widest shadow-neon hover:scale-105 transition-transform"
          >
            Play Now
          </Link>
          <button
            className="md:hidden tap-target w-11 rounded-full glass flex items-center justify-center"
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="block w-5 h-[2px] bg-foreground relative before:content-[''] before:absolute before:-top-1.5 before:w-5 before:h-[2px] before:bg-foreground after:content-[''] after:absolute after:top-1.5 after:w-5 after:h-[2px] after:bg-foreground" />
          </button>
        </div>
      </div>
      {open && (
        <div className="md:hidden glass border-t border-border/40 animate-slide-up">
          <div className="px-4 py-4 flex flex-col gap-2">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="tap-target px-3 flex items-center rounded-lg hover:bg-secondary font-display uppercase tracking-widest text-sm"
              >
                {l.label}
              </a>
            ))}
            <Link
              to="/garage"
              className="tap-target px-3 flex items-center rounded-lg hover:bg-secondary font-display uppercase tracking-widest text-sm"
            >
              Garage
            </Link>
            <Link
              to="/freeroam"
              className="tap-target px-3 flex items-center rounded-lg hover:bg-secondary font-display uppercase tracking-widest text-sm"
            >
              Free Roam
            </Link>
            <Link
              to="/customize"
              className="tap-target px-3 flex items-center rounded-lg hover:bg-secondary font-display uppercase tracking-widest text-sm"
            >
              Customize
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}