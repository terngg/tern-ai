import type { Metadata } from "next";
import "./globals.css";
import "./providers.css";

export const metadata: Metadata = {
  title: "Tern AI — GTPS Lua Assistant",
  description:
    "A focused GTPS Lua coding assistant powered by your own Gemini or OpenRouter API key.",
  applicationName: "Tern AI",
  referrer: "strict-origin-when-cross-origin",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
