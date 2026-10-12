export default function Security() {
  return (
    <article className="prose">
      <span className="eyebrow">THE DESIGN, WITHOUT THE MYSTERY</span>
      <h1>How security works.</h1>
      <p>
        Wayvo Secrets encrypts and decrypts secret text in your browser using
        Web Crypto and AES-256-GCM. Every secret has a fresh random 256-bit key
        and a 96-bit nonce. Authenticated context separates the secret payload
        from the key check, preventing either from being substituted for the
        other. Keys stay in the share link’s fragment and are never sent by the
        application to the API.
      </p>
      <pre>
        {
          "Your browser → encrypted envelope → private R2\nShare link fragment → recipient’s browser\nExplicit Reveal → atomic D1 claim → ciphertext\nRecipient’s browser + fragment key → plaintext"
        }
      </pre>
      <h2>Three independent capabilities</h2>
      <p>
        The dashboard link grants access to unencrypted labels and delivery
        metadata, and permission to create secrets. A separate random redemption
        token authorizes one retrieval. These authorization tokens are
        deliberately sent to our API over HTTPS; only their hashes are stored.
        Neither is the secret’s encryption key.
      </p>
      <h2>Opening is safe. Revealing is final.</h2>
      <p>
        Page loads and status checks never claim a secret or return its
        protected ciphertext. A separate encrypted key check lets your browser
        reject an incorrect key before attempting a claim. An explicit Reveal
        click atomically claims the secret in D1 before R2 is read. Concurrent
        claims have one winner.
      </p>
      <p>
        If storage or network delivery fails after a claim, the secret can be
        lost. We fail closed rather than allow a second retrieval. “Accessed”
        records ciphertext issued to a claimant, not proof a person saw or
        understood it. “Unavailable” records a claim that could not finish.
      </p>
      <h2>Expiration and deletion</h2>
      <p>
        The API enforces expiry immediately. After a claim, ciphertext deletion
        is attempted; an R2 lifecycle rule deletes remaining objects after seven
        days, asynchronously. Secret metadata is visible for 365 days. Dashboard
        links expire after one year of inactivity. A daily cleanup job removes
        retained records.
      </p>
      <h2>What encryption cannot protect</h2>
      <p>
        Anyone with a full share link can claim its secret. Anyone with a
        dashboard link can see its metadata and create secrets. There is no
        recovery for lost links. Sensitive labels, copied text, browser
        extensions, clipboard history, screenshots, and a compromised device are
        outside this protection.
      </p>
      <p>
        A compromised website or malicious future JavaScript could steal
        plaintext or keys. Open source makes the design auditable; it does not
        prove that a deployment serves identical code. Turnstile is isolated in
        a separate-origin frame inside a trusted verification window. Its script
        cannot access the application’s secret text, keys, or remembered
        dashboard storage.
      </p>
      <h2>Source and reporting</h2>
      <p>
        Inspect{" "}
        <a href="https://github.com/wayvo-ai/secrets">
          wayvo-ai/secrets on GitHub
        </a>
        . The code is licensed under Apache-2.0. For security reports, follow
        SECURITY.md in the repository. Never include a real secret, a dashboard
        capability, or a complete share link in an issue or support request.
      </p>
    </article>
  );
}
