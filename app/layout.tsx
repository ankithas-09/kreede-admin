import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "KREEDE Admin",
  description: "Admin auth starter",
};

// Ensures proper scaling on mobile (safe-area aware)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
            <div
              style={{
                position: "absolute",
                right: "-140px",
                top: "-140px",
                width: 320,
                height: 320,
                borderRadius: "50%",
                background:
                  "radial-gradient(closest-side, rgba(246,110,18,0.20), transparent 70%)",
                filter: "blur(10px)",
              }}
            />
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
