"use client";
import { useState } from "react";
import { Share2, Megaphone } from "lucide-react";
import { WayvoLogo } from "@/components/wayvo-logo";
import { Button } from "@/components/ui/button";

export function ShareSite() {
  const [status, setStatus] = useState("");
  async function share() {
    const url = new URL("/", location.origin).href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Wayvo Secrets",
          text: "Some things shouldn’t stay in chat. Send them encrypted. Reveal them once.",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setStatus("Website link copied. Share it with friends.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Could not share. Please try again.");
    }
  }
  return (
    <div className="share-site">
      <Megaphone className="share-site-icon" size={32} aria-hidden="true" />
      <div className="share-site-copy">
        <strong className="share-site-heading">
          Like{" "}
          <span className="share-wordmark">
            <WayvoLogo />
          </span>{" "}
          Secrets?
        </strong>
        <p className="small muted">
          Only the website link is shared—never your secret or private links.
        </p>
      </div>
      <Button
        className="share-site-button"
        variant="outline"
        type="button"
        onClick={share}
        aria-label="Spread the word about Wayvo Secrets"
      >
        <Share2 size={17} aria-hidden="true" />
        Spread the word
      </Button>
      <p className="small" role="status">
        {status}
      </p>
    </div>
  );
}
