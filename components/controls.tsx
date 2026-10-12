"use client";
import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      remove: (id: string) => void;
    };
  }
}
export function Copy({
  value,
  children,
  onCopied,
  variant = "outline",
  dismissOnCopy = false,
}: {
  value: string;
  children: React.ReactNode;
  onCopied?: () => void;
  variant?: "default" | "outline";
  /** Remove the control after a successful copy (dismissible notices only). */
  dismissOnCopy?: boolean;
}) {
  const [status, setStatus] = useState("");
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (status !== "Copied") return;
    const timer = setTimeout(
      () => (dismissOnCopy ? setHidden(true) : setStatus("")),
      1400,
    );
    return () => clearTimeout(timer);
  }, [status, dismissOnCopy]);
  if (hidden) return null;
  return (
    <span
      className={`copy${status === "Copied" && dismissOnCopy ? " copy-success" : ""}`}
    >
      <Button
        type="button"
        variant={variant}
        disabled={status === "Copied"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setStatus("Copied");
            onCopied?.();
          } catch {
            setStatus("Copy failed. Select and copy the text manually.");
          }
        }}
      >
        {status === "Copied" ? "✓ Copied" : children}
      </Button>
      <span
        role="status"
        className={status === "Copied" ? "sr-only" : undefined}
      >
        {status}
      </span>
    </span>
  );
}
export function Challenge({
  action,
  onToken,
}: {
  action: string;
  onToken: (token: string) => void;
}) {
  const channel = useRef<BroadcastChannel | null>(null);
  const [status, setStatus] = useState("");
  useEffect(() => () => channel.current?.close(), []);
  return (
    <div>
      <Button
        type="button"
        variant="default"
        onClick={() => {
          channel.current?.close();
          if (
            process.env.NODE_ENV === "development" &&
            (["localhost", "127.0.0.1"].includes(location.hostname) ||
              location.origin === process.env.NEXT_PUBLIC_DEV_PREVIEW_ORIGIN) &&
            process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ===
              "1x00000000000000000000AA"
          ) {
            onToken("XXXX.DUMMY.TOKEN.XXXX");
            return;
          }
          const verifier = process.env.NEXT_PUBLIC_VERIFICATION_ORIGIN || "";
          try {
            const origin = new URL(verifier);
            if (
              origin.protocol !== "https:" ||
              origin.origin !== verifier ||
              origin.origin === location.origin
            )
              throw new Error();
          } catch {
            setStatus("Verification is not configured. Contact the operator.");
            return;
          }
          const id = crypto.randomUUID();
          const bus = new BroadcastChannel(id);
          channel.current = bus;
          bus.onmessage = (event) => {
            if (typeof event.data === "string") {
              onToken(event.data);
              setStatus("Verification complete.");
              bus.close();
            }
          };
          const width = Math.min(420, window.outerWidth || 420);
          const height = Math.min(480, window.outerHeight || 480);
          const left = Math.round(
            window.screenX + (window.outerWidth - width) / 2,
          );
          const top = Math.round(
            window.screenY + (window.outerHeight - height) / 2,
          );
          window.open(
            `/verify.html#channel=${id}&action=${action}&sitekey=${encodeURIComponent(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "")}&verifier=${encodeURIComponent(verifier)}`,
            "_blank",
            `noopener,noreferrer,popup=yes,width=${width},height=${height},left=${left},top=${top}`,
          );
          setStatus("Complete verification in the new window.");
        }}
      >
        <ShieldCheck size={17} aria-hidden="true" />
        Verify you’re human
      </Button>
      <p className="small" role="status">
        {status}
      </p>
    </div>
  );
}
