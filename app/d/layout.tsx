import type { Metadata } from "next";
// Capability pages: the link fragment is the credential, so keep them out of search results.
export const metadata: Metadata = {
  title: "My Secrets",
  robots: { index: false, follow: false, nocache: true },
  alternates: { canonical: null },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
