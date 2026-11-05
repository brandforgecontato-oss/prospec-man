import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BrandForge — Prospecção",
  description: "Painel de prospecção autônoma no Instagram",
};

const NAV_LINKS = [
  { href: "/", label: "Painel" },
  { href: "/leads", label: "Leads" },
  { href: "/leads/novo", label: "Novo lead" },
  { href: "/experimentos", label: "Experimentos" },
  { href: "/excecoes", label: "Segurança" },
];

/** The brand's faceted "BF" mark, redrawn as geometry — a flag/pennant for the B, a stepped bar for the F. */
function BrandMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="h-7 w-7 shrink-0"
      aria-hidden="true"
      fill="none"
    >
      <path d="M6 4 L18 11 L6 18 Z" fill="var(--color-gold)" />
      <path d="M6 18 L18 18 L11 26 L6 26 Z" fill="var(--color-gold)" />
      <path d="M20 4 L28 4 L22 11 L14 11 Z" fill="var(--color-gold)" opacity="0.85" />
    </svg>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${playfair.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-cream font-sans text-ink">
        <header className="bg-ink text-cream">
          <nav className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
            <Link href="/" className="flex items-center gap-2">
              <BrandMark />
              <span className="font-display text-lg font-semibold tracking-tight text-cream">
                BrandForge
              </span>
            </Link>
            <div className="flex gap-6 text-sm">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-cream/70 transition-colors hover:text-gold"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10">
          {children}
        </div>
      </body>
    </html>
  );
}
