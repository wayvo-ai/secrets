"use client";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Card } from "@/components/ui/card";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Eye,
  LockKeyhole,
  Clipboard,
  Eraser,
} from "lucide-react";
import { verifyKey, decrypt } from "@/lib/crypto";
import { parseShareFragment, type ShareParts } from "@/lib/share-link";
import { ApiError, getCheck, reveal } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { ShareSite } from "@/components/share-site";
import { Copy } from "@/components/controls";
export default function Secret() {
  const parts = useRef<{
      id: string;
      r: string;
      k: string;
    } | null>(null),
    pending = useRef(false);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const reload = () => location.reload();
    window.addEventListener("hashchange", reload);
    return () => window.removeEventListener("hashchange", reload);
  }, []);
  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      let parsed: ShareParts;
      try {
        parsed = parseShareFragment(location.hash);
      } catch {
        setError(
          "This link is incomplete or invalid. Ask the sender for the full link.",
        );
        return;
      }
      const { id, r, k } = parsed;
      parts.current = { id, r, k };
      void getCheck(id, r)
        .then((check) => verifyKey(k, check))
        .then(() => setReady(true))
        .catch(() =>
          setError(
            "This link has an invalid key, has expired, or is unavailable.",
          ),
        );
    })();
  }, []);
  async function open() {
    if (pending.current || !parts.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    let stage: "check" | "reveal" | "decrypt" = "check";
    try {
      const { id, r, k } = parts.current;
      await verifyKey(k, await getCheck(id, r));
      stage = "reveal";
      const { envelope } = await reveal(id, r);
      stage = "decrypt";
      setText(await decrypt(k, envelope));
      history.replaceState(null, "", "/s");
      parts.current = null;
      setReady(false);
    } catch (e) {
      // WebCrypto rejects with a DOMException whose message is empty or
      // engine-specific, and fetch failures are TypeErrors; neither is user text.
      const detail =
        e instanceof ApiError
          ? e.message
          : e instanceof TypeError
            ? "Could not reach the server. Check your connection and try again."
            : stage === "decrypt"
              ? "The secret was claimed but could not be decrypted."
              : "This link has an invalid key, has expired, or is unavailable.";
      setError(
        stage === "check"
          ? detail
          : `${detail} If a claim started, it cannot be retried.`,
      );
      // A transient failure before the reveal request means nothing was claimed,
      // so Reveal stays available; definitive or post-request failures stay final.
      const transient =
        e instanceof TypeError ||
        (e instanceof ApiError && (e.status >= 500 || e.status === 429));
      if (stage === "check" && transient) pending.current = false;
      else setReady(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="reveal my-6 p-5 md:p-7 gap-0">
      <div className="lock-orbit">
        <LockKeyhole size={30} />
      </div>
      <span className="eyebrow">A PRIVATE HANDOFF</span>
      <h1>
        {text === null ? "For your eyes. Once." : "Your secret is revealed."}
      </h1>
      {text === null ? (
        <>
          <p>
            Opening this page does not consume the secret. When you’re ready,
            reveal it below. Only the first claim can retrieve it.
          </p>
          <Button disabled={!ready || busy} onClick={open}>
            <Eye size={17} aria-hidden="true" />
            {busy ? "Revealing…" : "Reveal Secret"}
          </Button>
          <p className="small muted">Make sure you’re somewhere private.</p>
        </>
      ) : (
        <>
          <p>
            This secret cannot be retrieved again. Keep it somewhere safe before
            leaving this page.
          </p>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: long secrets scroll, so the region must be keyboard-reachable. */}
          <pre tabIndex={0}>{text}</pre>
          <div className="my-3 grid grid-cols-2 items-start gap-3 [&>.copy]:min-w-0 [&>.copy>button]:w-full [&_button]:m-0 [&_button]:px-2 [&_button]:text-xs sm:[&_button]:text-sm">
            <Copy value={text} variant="default">
              <Clipboard size={16} aria-hidden="true" />
              Copy Secret
            </Copy>
            <Button
              variant="outline"
              onClick={() => {
                setText(null);
                setError(
                  "Secret cleared from this view. It cannot be retrieved again.",
                );
              }}
            >
              <Eraser size={16} aria-hidden="true" />
              Clear from screen
            </Button>
          </div>
          <ShareSite />
        </>
      )}
      <ErrorAlert message={error} />
      <a href="/security" className="small design-link mt-6 self-center">
        How your secret is protected{" "}
        <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </Card>
  );
}
