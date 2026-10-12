"use client";
import { useEffect, useState } from "react";
import { Bookmark, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dashboardFragment, parseDashboardFragment } from "@/lib/share-link";
const storageKey = "wayvo.remembered-dashboard";
function readSaved(): string {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!data) return "";
    if (typeof data.expires !== "number" || data.expires <= Date.now()) {
      localStorage.removeItem(storageKey);
      return "";
    }
    parseDashboardFragment(data.fragment);
    return data.fragment;
  } catch {
    return "";
  }
}
export function RememberDashboard({
  capability,
  onRememberedChange,
  expiresAt,
}: {
  capability?: string;
  expiresAt?: number;
  onRememberedChange?: (remembered: boolean) => void;
}) {
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => {
      const value = readSaved();
      setSaved(value);
      onRememberedChange?.(!!value);
    };
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [onRememberedChange]);
  const fragment = capability ? dashboardFragment(capability) : "";
  const remembered = !!saved && (!capability || saved === fragment);
  useEffect(() => {
    if (!fragment || !expiresAt || expiresAt <= Date.now()) return;
    try {
      const current = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (current?.fragment === fragment) {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ fragment, expires: expiresAt }),
        );
      }
    } catch {
      // Remembering is optional; storage failures must not prevent dashboard access.
    }
  }, [fragment, expiresAt]);
  function forget() {
    try {
      localStorage.removeItem(storageKey);
      setSaved("");
      setError("");
    } catch {
      setError(
        "Browser storage is unavailable. Clear site data to forget this dashboard.",
      );
    }
  }
  if (!capability && !saved) return null;
  if (capability && remembered)
    return (
      <div className="remember-dashboard remembered-compact">
        <Button
          type="button"
          variant="link"
          className="h-auto min-h-0 p-0 underline underline-offset-4"
          onClick={forget}
        >
          Stop remembering on this device
        </Button>
        <p className="small muted">
          Removes saved access from this browser. Your dashboard stays active.
        </p>
        <p className="small" role="status">
          {error}
        </p>
      </div>
    );
  return (
    <div className={`remember-dashboard${capability ? " remember-panel" : ""}`}>
      {capability && (
        <Bookmark
          className="remember-panel-icon"
          size={24}
          aria-hidden="true"
        />
      )}
      {capability ? (
        <>
          <strong>
            {remembered ? "Dashboard remembered" : "Come back easily"}
          </strong>
          <p className="small muted">
            Saves dashboard access in this browser. Only use this on a device
            you trust.
          </p>
          {remembered ? (
            <Button type="button" variant="outline" onClick={forget}>
              Stop remembering on this device
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={!expiresAt}
              onClick={() => {
                try {
                  if (!expiresAt || expiresAt <= Date.now()) {
                    setError(
                      "This dashboard has expired and cannot be remembered.",
                    );
                    return;
                  }
                  localStorage.setItem(
                    storageKey,
                    JSON.stringify({
                      fragment,
                      expires: expiresAt,
                    }),
                  );
                  setSaved(fragment);
                  setError("");
                } catch {
                  setError(
                    "This browser couldn’t save access. Bookmark or copy the dashboard link instead.",
                  );
                }
              }}
            >
              <Bookmark size={17} aria-hidden="true" />
              Remember
            </Button>
          )}
          {saved && !remembered && (
            <p className="small">
              Remembering this dashboard replaces the one previously saved.
            </p>
          )}
        </>
      ) : (
        <Button asChild className="remember-open">
          <a href={`/d${saved}`}>
            Go to my dashboard <ArrowRight size={17} aria-hidden="true" />
          </a>
        </Button>
      )}
      <p className="small" role="status">
        {error}
      </p>
    </div>
  );
}
