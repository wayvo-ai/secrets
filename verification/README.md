# Isolated human verification

This directory is a standalone static site served from its own origin (`https://verify.secrets.wayvo.ai`), separate from the application. Never copy `widget.js` or this index into the main app's public directory; the verification origin must contain no application pages or secrets. The application's trusted `/verify` bridge embeds this origin, so Cloudflare's Turnstile script cannot access the application's DOM or localStorage.

The app build reads the verification origin from `NEXT_PUBLIC_VERIFICATION_ORIGIN`, and the API checks Turnstile results against `TURNSTILE_HOSTNAME`, which is the verification hostname, not the application hostname. A missing verification origin fails closed. Local loopback development keeps its explicit test bypass.

To serve the application from a different origin, change the exact parent allowlist in `widget.js` and `frame-ancestors` in `_headers` to match.
