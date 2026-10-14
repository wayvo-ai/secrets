import type { Metadata } from "next";
// Link previews see only /s (the fragment never leaves the browser), so every secret link
// unfurls with this card: it says "you were sent a secret", unlike the home page's site card.
const title = "You’ve been sent a secret";
const description =
  "Someone shared a secret with you through Wayvo Secrets. It can be viewed once, then it’s deleted.";
const image = {
  url: "/social-card-secret.png",
  width: 1200,
  height: 630,
  alt: "Wayvo Secrets. Someone sent you a secret. It can be viewed once, then it’s deleted.",
};
// Capability pages: the link fragment is the credential, so keep them out of search results.
export const metadata: Metadata = {
  title: "Reveal a secret",
  description,
  openGraph: {
    type: "website",
    siteName: "Wayvo Secrets",
    title,
    description,
    images: [image],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [image.url],
  },
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: null },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
