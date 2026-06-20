import { Dumbbell } from "lucide-react";

// Split auth layout: brand image on the left (desktop only), form on the right.
// The right panel opts into the `.dash` design tokens + Plus Jakarta font but
// overrides the background to white so the grey `.md-input` fields read cleanly.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex">
      {/* Left — brand image */}
      <div className="hidden lg:block lg:w-[45%] relative" style={{ background: "#0b1628" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/login-image.png"
          alt="GymPass"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>

      {/* Right — form area */}
      <div
        className="dash flex-1 flex flex-col items-center justify-center px-6 py-10"
        style={{ background: "#ffffff", minHeight: "100vh" }}
      >
        <div className="w-full" style={{ maxWidth: 400 }}>
          {/* Brand wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                background: "#3b7bf6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Dumbbell style={{ width: 20, height: 20, color: "#fff" }} />
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.35px", color: "var(--d-tx)" }}>
              Gym<span style={{ color: "#3b7bf6" }}>Pass</span>
            </span>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
