"use client";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

import { DashboardCelebration } from "@/components/dashboard-celebration";
import { ShareSite } from "@/components/share-site";
import { RememberDashboard } from "@/components/remember-dashboard";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useEffect, useRef, useState } from "react";
import { Clipboard, LockKeyhole, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Challenge, Copy } from "@/components/controls";
import { api, ApiError, createSecret } from "@/lib/client";
import { dashboardFragment, parseDashboardFragment } from "@/lib/share-link";
type Item = {
  id: string;
  label: string;
  createdAt: number;
  expiresAt: number;
  status: string;
  accessedAt: number | null;
};
type Page = {
  items: Item[];
  next: string | null;
  expiresAt: number;
};
const date = (n: number) => new Date(n).toLocaleString();
export default function Dashboard() {
  const encryptButton = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const reload = () => location.reload();
    window.addEventListener("hashchange", reload);
    return () => window.removeEventListener("hashchange", reload);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [invalidDashboard, setInvalidDashboard] = useState(false);
  const [dashboardExpiresAt, setDashboardExpiresAt] = useState<number>();
  const [cap, setCap] = useState(""),
    [items, setItems] = useState<Item[]>([]),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [welcome, setWelcome] = useState(false),
    [celebrate, setCelebrate] = useState(false),
    [copied, setCopied] = useState(false),
    [dismissingWelcome, setDismissingWelcome] = useState(false),
    [creating, setCreating] = useState(false),
    [label, setLabel] = useState(""),
    [text, setText] = useState(""),
    [ttl, setTtl] = useState(86400),
    [proof, setProof] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(""),
    [round, setRound] = useState(0);
  useEffect(() => {
    if (proof) encryptButton.current?.focus();
  }, [proof]);
  useEffect(() => {
    if (!dismissingWelcome) return;
    const timer = setTimeout(() => {
      setWelcome(false);
      setCopied(true);
    }, 1400);
    return () => clearTimeout(timer);
  }, [dismissingWelcome]);
  async function load(t: string, cursor?: string) {
    let result: Page;
    try {
      result = await api<Page>(
        `dashboard${cursor ? `?before=${encodeURIComponent(cursor)}` : ""}`,
        t,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setInvalidDashboard(true);
        try {
          const saved = JSON.parse(
            localStorage.getItem("wayvo.remembered-dashboard") || "null",
          );
          if (saved?.fragment === dashboardFragment(t)) {
            localStorage.removeItem("wayvo.remembered-dashboard");
            window.dispatchEvent(new Event("storage"));
          }
        } catch {
          /* Browser storage may be unavailable. */
        }
        setReady(false);
        location.replace("/?dashboard=unavailable");
      }
      throw error;
    }
    setItems((previous) =>
      cursor ? [...previous, ...result.items] : result.items,
    );
    setDashboardExpiresAt(result.expiresAt);
    setNext(result.next);
    setReady(true);
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only load; `load` is recreated each render.
  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      let t: string;
      try {
        t = parseDashboardFragment(location.hash);
      } catch {
        location.replace("/?dashboard=unavailable");
        return;
      }
      setCap(t);
      try {
        await load(t);
        if (new URLSearchParams(location.search).get("welcome") === "1") {
          setWelcome(true);
          setCelebrate(true);
          history.replaceState(null, "", `/d${dashboardFragment(t)}`);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);
  return (
    <div className="workspace">
      {celebrate && <DashboardCelebration />}
      <div className="page-heading dashboard-heading">
        <span className="eyebrow">YOUR PRIVATE DASHBOARD</span>
        <h1>My Secrets</h1>
        {ready && !creating && !link && (
          <Button
            onClick={() => {
              setCreating(true);
              setLink("");
              setError("");
            }}
          >
            <Plus size={17} /> Create Secret
          </Button>
        )}
        <p>Keep track of the handoff. Leave the secret behind.</p>
      </div>
      <ErrorAlert message={error} />
      {invalidDashboard && (
        <Button asChild>
          <a href="/?create=1">
            <Plus size={17} aria-hidden="true" />
            Create a new dashboard
          </a>
        </Button>
      )}
      {copied && (
        <p className="small" role="status">
          Dashboard link copied.
        </p>
      )}
      {ready && (
        <>
          {welcome && (
            <aside
              className={`notice dashboard-notice${dismissingWelcome ? " is-dismissing" : ""}`}
            >
              <ShieldCheck size={22} />
              <div>
                <strong>Your dashboard is ready. Keep this link safe.</strong>
                <p>
                  Bookmark this page (⌘D / Ctrl+D) or copy its link. Anyone with
                  it can see this metadata and create secrets. Lost links cannot
                  be recovered. This dashboard expires after one year of
                  inactivity.
                </p>
              </div>
              <Copy
                variant="default"
                dismissOnCopy
                value={`${location.origin}/d${dashboardFragment(cap)}`}
                onCopied={() => {
                  setDismissingWelcome(true);
                }}
              >
                <Clipboard size={16} aria-hidden="true" />
                Copy dashboard link
              </Copy>
            </aside>
          )}
          {creating && (
            <Card className="composer my-6 p-5 md:p-7 gap-0">
              <h2>Create a secret</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  // Enter in the label field submits implicitly while no submit button exists.
                  if (!proof || busy) return;
                  setBusy(true);
                  setError("");
                  try {
                    setLink(await createSecret(cap, label, text, ttl, proof));
                    setText("");
                    setLabel("");
                    setCreating(false);
                    await load(cap);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                    setProof("");
                    setRound((r) => r + 1);
                  }
                }}
              >
                <Label htmlFor="label">Name / label</Label>
                <Input
                  id="label"
                  maxLength={100}
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  aria-describedby="label-help"
                  placeholder="e.g. Staging access"
                />
                <p id="label-help" className="small">
                  Labels are unencrypted metadata. Do not include sensitive
                  information.
                </p>
                <Label htmlFor="secret">Secret text</Label>
                <Textarea
                  id="secret"
                  required
                  rows={5}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Only your recipient should see this."
                />
                <p className="small">
                  {new TextEncoder().encode(text).length.toLocaleString()} /
                  10,240 UTF-8 bytes · encrypted in your browser
                </p>
                <fieldset className="expiry-field">
                  <legend>Expires after</legend>
                  <RadioGroup
                    value={String(ttl)}
                    onValueChange={(value) => setTtl(Number(value))}
                    className="expiry-options"
                    aria-label="Expires after"
                  >
                    {[
                      [3600, "1 hour"],
                      [86400, "1 day"],
                      [259200, "3 days"],
                      [604800, "7 days"],
                    ].map(([value, title]) => (
                      <Label
                        key={value}
                        className="expiry-option"
                        htmlFor={`expiry-${value}`}
                      >
                        <RadioGroupItem
                          id={`expiry-${value}`}
                          value={String(value)}
                        />
                        <span>{title}</span>
                      </Label>
                    ))}
                  </RadioGroup>
                </fieldset>
                <div className="actions composer-actions">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setCreating(false);
                      setText("");
                      setProof("");
                    }}
                  >
                    Cancel
                  </Button>
                  {!proof ? (
                    <Challenge key={round} action="secret" onToken={setProof} />
                  ) : (
                    <Button
                      ref={encryptButton}
                      disabled={
                        busy || new TextEncoder().encode(text).length > 10240
                      }
                    >
                      <LockKeyhole size={17} aria-hidden="true" />
                      {busy
                        ? "Encrypting and creating…"
                        : "Encrypt & create link"}
                    </Button>
                  )}
                </div>
              </form>
            </Card>
          )}
          {link && (
            <Card className="my-6 p-5 md:p-7 gap-0">
              <h2>Your one-time link is ready</h2>
              <p>
                Anyone with this full link can reveal once. Copy it now; your
                dashboard cannot recover it.
              </p>
              <a
                className="secret-link-display"
                aria-label="One-time secret link (opens in a new tab)"
                href={link}
                target="_blank"
                rel="noopener noreferrer"
              >
                <LockKeyhole size={48} aria-hidden="true" />
                <span>{link}</span>
              </a>
              <p className="small">
                Opening this link does not consume the secret. Clicking “Reveal
                Secret” uses its one-time access, so leave that step to your
                recipient.
              </p>
              <div className="actions secret-link-actions">
                <Button variant="outline" onClick={() => setLink("")}>
                  Done
                </Button>
                <Copy value={link} variant="default">
                  <Clipboard size={16} aria-hidden="true" />
                  Copy secret link
                </Copy>
              </div>
              <ShareSite />
            </Card>
          )}
          <Card className="history my-6 p-5 md:p-7 gap-0">
            <div className="list-heading">
              <h2>
                Secret history <span className="muted">/</span>
              </h2>
            </div>
            {!items.length ? (
              <div className="empty">
                <ShieldCheck size={32} />
                <h3>No secrets shared yet</h3>
                <p>
                  Create your first secret. Only its label and delivery status
                  will appear here.
                </p>
              </div>
            ) : (
              <div className="table-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Accessed at</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.label}</TableCell>
                        <TableCell>{date(item.createdAt)}</TableCell>
                        <TableCell>{date(item.expiresAt)}</TableCell>
                        <TableCell>
                          <span className="pill">
                            {item.status === "Available" &&
                            item.expiresAt <= now
                              ? "Expired"
                              : item.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {item.accessedAt ? date(item.accessedAt) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {next && (
              <Button
                variant="outline"
                onClick={() =>
                  void load(cap, next).catch((e) => setError(e.message))
                }
              >
                Load more
              </Button>
            )}
          </Card>
          <p className="small muted">
            Accessed means ciphertext was issued to the winning claimant, not
            proof that a person read it. Unavailable means a claim could not
            finish. History is retained for 365 days; maximum 100 secrets per
            dashboard.
          </p>
          <RememberDashboard capability={cap} expiresAt={dashboardExpiresAt} />
        </>
      )}
    </div>
  );
}
