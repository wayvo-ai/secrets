# Security policy

Do not post vulnerabilities containing active links, keys, plaintext, or authorization capabilities to public issues. Prefer GitHub's private vulnerability reporting on https://github.com/wayvo-ai/secrets/security/advisories/new once the owner enables it. If private reporting is unavailable, open an issue requesting a private contact channel without technical exploit details or sensitive data. No monitored email address or response SLA is asserted.

## Trust boundaries

Secret encryption keys are random AES-256-GCM keys used by Web Crypto only in the browser. They are in URL fragments, never API inputs. Dashboard and redemption capabilities are independent random authorization tokens; they intentionally travel in HTTPS Authorization headers and are hashed with SHA-256 before indexed lookups. Client-created capability hashes are accepted at registration/creation. Never log headers, request bodies, fragments, tokens or plaintext.

The authenticated status endpoint returns a separate key-check ciphertext, never the protected secret ciphertext or label. A malicious holder of a redemption token can intentionally burn a secret without a key; the key check prevents accidental consumption by the normal client, not deliberate denial of service by an authorized token holder.

A single D1 conditional UPDATE arbitrates claims across Workers. R2 is read only by its winner. Read/JSON/metadata failures after that update lose the secret rather than permit replay. Deletion failure cannot restore access. accessed_at is set immediately before constructing the ciphertext response; server state cannot prove network delivery or plaintext viewing. claimed_at records the earlier reservation. Dashboard users cannot redeem with their dashboard capability.

## Limitations

Leaked full share links permit retrieval. Leaked dashboard links permit metadata access and creation. No identity verification, recovery, revocation, or recipient binding is promised. Labels are public to dashboard holders and to the operator. Malicious deployed JavaScript or browser extensions can steal secrets. The separate no-opener Turnstile window avoids loading third-party JavaScript alongside sensitive state, but the deployment and its same-origin code remain trusted. Browser history, clipboard managers and screenshots may retain data. Memory clearing in JavaScript is not guaranteed.

Static pages and API use no-store and no-referrer. Static script hashes enforce CSP; inline styles are permitted for framework/UI compatibility. Verify final deployed headers because hosting transformations can change behavior. The app includes no telemetry, persistent secret cache, or service worker. Optional Remember stores the dashboard capability and its server-defined expiry in localStorage; anyone using that browser profile can use it. Secret contents and decryption keys are never persisted by that feature.

## Rate limiting

Application rate limits do not absorb a distributed volumetric attack. Application rate counters store salted minute-specific hashes, not raw IPs; the hashes of sources that exceeded a limit are also held in Worker memory for the rest of that minute. Provider processing may include IPs and operational logs. No independent security audit has been performed.
