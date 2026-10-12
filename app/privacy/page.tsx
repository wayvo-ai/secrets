export default function Privacy() {
  return (
    <article className="prose">
      <span className="eyebrow">COLLECT LESS. KEEP LESS.</span>
      <h1>Your privacy.</h1>
      <p>
        No account, email address, profile, creator identity, or recipient
        identity is required or stored in application records.
      </p>
      <h2>What is stored</h2>
      <p>
        Private R2 storage holds encrypted envelopes. D1 stores dashboard and
        secret IDs, authorization token hashes, unencrypted labels, creation and
        expiry times, dashboard last-access times, and claim / ciphertext
        issuance timestamps. Encryption keys and complete share links are not
        stored by the application. Do not put sensitive information in labels.
      </p>
      <h2>Retention</h2>
      <p>
        Secret metadata is available for 365 days from creation. Dashboard
        capabilities expire after 365 days without authenticated dashboard
        access. Operators run daily cleanup to remove older metadata and unused
        expired dashboards. Claimed ciphertext is deleted best effort; all
        remaining ciphertext is subject to a seven-day R2 lifecycle rule.
        Physical deletion is asynchronous. Provider backups and operational logs
        follow the provider’s configured retention.
      </p>
      <h2>Abuse prevention and infrastructure</h2>
      <p>
        Cloudflare processes request metadata, including IP addresses, to serve
        the site and provide Turnstile verification and abuse protection. Our
        rate limiter retains salted, minute-specific hashes derived from request
        IPs (grouped by /64 for IPv6) or dashboard IDs, and briefly keeps the
        hashes of sources that exceeded a limit in server memory for the rest of
        that minute. Counters expire logically within two minutes; their stored
        hashes are removed by daily cleanup and can remain longer if cleanup is
        delayed. IPs are not added to dashboard or secret records. We do not
        promise that no infrastructure logs exist.
      </p>
      <p>
        The application does not use analytics, error-reporting SDKs, or
        persistent secret caches. If you choose “Remember this dashboard on this
        device,” we save its access token and a local expiry time in this
        browser’s local storage with the dashboard’s expiration time. Expired
        saved access is removed when you next visit the application. This does
        not extend the dashboard’s lifetime. Anyone using this browser profile
        can access the remembered dashboard. “Stop remembering on this device”
        removes this saved access without deleting the dashboard. Clearing site
        data also removes it. Secret contents and decryption keys are not saved
        by this feature. Your browser may still retain history and clipboard
        contents. Bookmark dashboard links securely; treat full secret links as
        secrets themselves.
      </p>
      <h2>Know the limits</h2>
      <p>
        Read <a href="/security">the security design and limitations</a> and
        inspect <a href="https://github.com/wayvo-ai/secrets">the source</a>. A
        compromised client or website can expose plaintext regardless of server
        storage encryption.
      </p>
    </article>
  );
}
