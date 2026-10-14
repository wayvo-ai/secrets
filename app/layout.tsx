import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import "./globals.css";
import styles from "./site.module.css";
import { WayvoLogo } from "@/components/wayvo-logo";
import { SkipLink } from "@/components/skip-link";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://secrets.wayvo.ai";
const description =
  "Share passwords, API keys and other secrets with a one-time link. Encrypted in your browser with AES-256-GCM, revealed once, then gone. No account or email required. Open source.";
const socialDescription =
  "Some things shouldn’t stay in chat. Send them encrypted. Reveal them once.";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Wayvo Secrets",
    title: "Wayvo Secrets — Share a secret, just once.",
    description: socialDescription,
    images: [
      {
        url: "/social-card.png",
        width: 1200,
        height: 630,
        alt: "Wayvo Secrets. Some things shouldn’t stay in chat. Send them encrypted. Reveal them once.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wayvo Secrets — Share a secret, just once.",
    description: socialDescription,
    images: ["/social-card.png"],
  },
  title: {
    default:
      "Wayvo Secrets — Share passwords and secrets with one-time encrypted links",
    template: "%s · Wayvo Secrets",
  },
  description,
  applicationName: "Wayvo Secrets",
  keywords: [
    "share password securely",
    "one-time secret link",
    "self-destructing message",
    "encrypted secret sharing",
    "share API keys",
    "end-to-end encryption",
    "open source",
  ],
  category: "security",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};
const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Wayvo Secrets",
  url: siteUrl,
  description,
  applicationCategory: "SecurityApplication",
  operatingSystem: "Any (web browser)",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  license: "https://www.apache.org/licenses/LICENSE-2.0",
  codeRepository: "https://github.com/wayvo-ai/secrets",
  publisher: {
    "@type": "Organization",
    name: "Wayvo",
    url: "https://wayvo.ai",
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={styles.site}>
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static, trusted JSON-LD
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
        <SkipLink />
        <header>
          <a className="brand" href="/" aria-label="Wayvo Secrets home">
            <WayvoLogo /> <span className="brand-sub">/ secrets</span>
          </a>
          <nav aria-label="Main">
            <a href="/security">Security</a>
            <a href="https://github.com/wayvo-ai/secrets" rel="noreferrer">
              GitHub <ArrowUpRight size={14} />
            </a>
          </nav>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer>
          <span className="footer-brand">
            <span
              className="footer-wordmark"
              role="img"
              aria-label="Wayvo Secrets"
            >
              <WayvoLogo /> <span aria-hidden="true">/ secrets</span>
            </span>
            <span className="muted">· A little less left behind.</span>
          </span>
          <div>
            <a href="/security">Security</a>
            <a href="/privacy">Privacy</a>
            <a
              className="footer-source"
              href="https://github.com/wayvo-ai/secrets"
            >
              Source code <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
