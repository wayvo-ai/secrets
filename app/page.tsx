"use client";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Card } from "@/components/ui/card";

import { useEffect, useRef, useState } from "react";
import {
  Plus,
  CircleAlert,
  ArrowRight,
  ArrowDown,
  ArrowUpRight,
  KeyRound,
  Link2,
  ShieldCheck,
  Check,
  LockKeyhole,
} from "lucide-react";
import { RememberDashboard } from "@/components/remember-dashboard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Challenge } from "@/components/controls";
import { createDashboard } from "@/lib/client";
export default function Home() {
  const setupHeading = useRef<HTMLHeadingElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);
  const [remembered, setRemembered] = useState(false);
  const [dashboardUnavailable, setDashboardUnavailable] = useState(false);
  const [start, setStart] = useState(false),
    [proof, setProof] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [round, setRound] = useState(0);
  useEffect(() => {
    void Promise.resolve().then(() => {
      const url = new URL(location.href);
      if (url.searchParams.get("dashboard") === "unavailable") {
        setDashboardUnavailable(true);
        url.searchParams.delete("dashboard");
        history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
      if (url.searchParams.get("create") === "1") {
        setStart(true);
        url.searchParams.delete("create");
        history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    });
  }, []);
  useEffect(() => {
    if (start) {
      setupHeading.current?.focus({ preventScroll: true });
      setupHeading.current?.scrollIntoView({ block: "nearest" });
    }
  }, [start]);
  useEffect(() => {
    if (proof) createButton.current?.focus();
  }, [proof]);
  return (
    <>
      {dashboardUnavailable && (
        <Alert
          variant="destructive"
          className="dashboard-error-alert mt-5 border-red-200 bg-red-50 text-red-800"
        >
          <CircleAlert size={22} aria-hidden="true" />
          <AlertDescription className="text-red-800">
            Invalid or expired dashboard link. You can create a new dashboard
            below.
          </AlertDescription>
        </Alert>
      )}
      <section className="hero">
        <div>
          <span className="eyebrow">
            <span className="dot" /> PRIVATE BY DESIGN. SHARED ONCE.
          </span>
          <h1>
            Share a secret,
            <br />
            <em>just once.</em>
          </h1>
          <p className="lead">
            Some things aren’t meant to stay in a chat.
            <br />
            Send credentials, API keys, and temporary passwords with a link that
            works once.
          </p>
          <RememberDashboard onRememberedChange={setRemembered} />
          {!start && !remembered && (
            <>
              <div className="actions">
                <Button onClick={() => setStart(true)}>
                  Create My Dashboard <ArrowRight size={17} />
                </Button>
                <a className="text-link" href="#how">
                  How it works <ArrowDown size={17} aria-hidden="true" />
                </a>
              </div>
              <p className="small muted">
                No account. No email. No passwords to remember.
              </p>
            </>
          )}
          {start && (
            <Card className="setup my-6 p-5 md:p-7 gap-0">
              <h2 ref={setupHeading} tabIndex={-1}>
                Your private starting point
              </h2>
              <p>
                Keep your dashboard link like a password. Anyone with it can see
                labels and create secrets. Lost links cannot be recovered.
              </p>
              <div className="setup-footer">
                <p className="small" role="status">
                  {proof
                    ? "Human verification complete. Your dashboard is ready to create."
                    : "A quick bot check opens in a separate window. No account or payment details required."}
                </p>
                {!proof ? (
                  <Challenge
                    key={round}
                    action="dashboard"
                    onToken={setProof}
                  />
                ) : (
                  <Button
                    ref={createButton}
                    disabled={!proof || busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        location.assign(await createDashboard(proof));
                      } catch (e) {
                        setError((e as Error).message);
                        setProof("");
                        setRound((r) => r + 1);
                        setBusy(false);
                      }
                    }}
                  >
                    <Plus size={17} aria-hidden="true" />
                    {busy ? "Creating…" : "Create dashboard link"}
                  </Button>
                )}
              </div>
              <ErrorAlert message={error} />
            </Card>
          )}
        </div>
        <figure
          className="hero-art"
          aria-label="Encrypted secret delivered once"
        >
          <div className="art-top">
            <span className="tiny-label">A SAFER HANDOFF</span>
            <span className="pill">
              <span className="dot" /> Encrypted locally
            </span>
          </div>
          <div className="secret-illustration">
            <div className="lock-orbit">
              <LockKeyhole size={33} />
            </div>
            <h3>Your secret stays yours.</h3>
            <p>•••• •••• •••• ••••</p>
            <div className="illustration-rule" />
            <div className="art-row">
              <span>Access limit</span>
              <strong>One reveal</strong>
            </div>
            <div className="art-row">
              <span>Encryption</span>
              <strong>AES-256-GCM</strong>
            </div>
          </div>
          <div className="art-bottom">
            <ShieldCheck size={16} /> Encrypted here. Decrypted there.
          </div>
        </figure>
      </section>
      <section className="trust-strip">
        <ShieldCheck size={22} />
        <p>
          <strong>Browser-side end-to-end encryption.</strong> Secret encryption
          keys are never sent to the server.
        </p>
        <a className="design-link" href="/security">
          Explore the design <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </section>
      <section id="how" className="how">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LESS EXPOSURE. LESS FRICTION.</span>
            <h2>Three steps. One reveal.</h2>
          </div>
          <p>
            A small tool for things that
            <br />
            shouldn’t live forever.
          </p>
        </div>
        <div className="steps">
          {[
            [
              KeyRound,
              "01",
              "Encrypt in your browser",
              "Write your secret and choose its expiry. A fresh encryption key is generated on your device.",
            ],
            [
              Link2,
              "02",
              "Share the one-time link",
              "Copy the link and send it your way. The full link is only available when you create it.",
            ],
            [
              Check,
              "03",
              "Reveal. Then it’s gone.",
              "The first explicit reveal claims the secret. Later attempts cannot retrieve it.",
            ],
          ].map(([Icon, n, title, description]) => {
            const I = Icon as typeof KeyRound;
            return (
              <article key={n as string}>
                <div className="step-head">
                  <I size={23} aria-hidden="true" />
                  <h3>{title as string}</h3>
                  <span>{n as string}</span>
                </div>
                <p>{description as string}</p>
              </article>
            );
          })}
        </div>
      </section>
      <section className="source">
        <div>
          <span className="eyebrow">TRUST YOU CAN INSPECT</span>
          <h2>Small surface. Open source.</h2>
          <p>
            Read the code and understand the tradeoffs. A compromised browser or
            website can still expose secrets; encryption depends on the code
            running on your device.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="https://github.com/wayvo-ai/secrets">
            View source on GitHub <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </Button>
      </section>
    </>
  );
}
