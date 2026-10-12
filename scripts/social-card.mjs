import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
const logo = (await readFile("components/wayvo-logo.tsx", "utf8"))
  .match(/<g>[\s\S]*<\/g>/)[0]
  .replaceAll("fillRule", "fill-rule")
  .replaceAll("clipRule", "clip-rule")
  .replaceAll("currentColor", "#ffffff");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#17132b"/><circle cx="1100" cy="100" r="330" fill="#8524d6" opacity=".22"/><circle cx="1090" cy="560" r="260" fill="#8524d6" opacity=".16"/><g transform="translate(72 68) scale(1.8)">${logo}</g><text x="285" y="99" fill="#d1b3ef" font-family="Arial,sans-serif" font-size="36">/ secrets</text><text x="72" y="225" fill="white" font-family="Arial,sans-serif" font-weight="bold" font-size="58">Some things shouldn’t</text><text x="72" y="297" fill="white" font-family="Arial,sans-serif" font-weight="bold" font-size="58">stay in chat.</text><text x="72" y="380" fill="#d1b3ef" font-family="Arial,sans-serif" font-size="34">Send them encrypted. Reveal them once.</text><path d="M970 292v-45a45 45 0 0 1 90 0v45" fill="none" stroke="#d1b3ef" stroke-width="12"/><rect x="946" y="292" width="138" height="108" rx="20" fill="#8524d6"/><circle cx="1015" cy="336" r="10" fill="white"/><path d="M1015 345v20" stroke="white" stroke-width="9" stroke-linecap="round"/><path d="M72 493h1056" stroke="#443457"/><text x="72" y="550" fill="#c2b9cf" font-family="Arial,sans-serif" font-size="24">Browser-side encryption · One-time reveal · No account needed</text></svg>`;
await writeFile("public/social-card.svg", svg);
await sharp(Buffer.from(svg)).png().toFile("public/social-card.png");
