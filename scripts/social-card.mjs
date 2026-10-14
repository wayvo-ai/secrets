import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
const logo = (await readFile("components/wayvo-logo.tsx", "utf8"))
  .match(/<g>[\s\S]*<\/g>/)[0]
  .replaceAll("fillRule", "fill-rule")
  .replaceAll("clipRule", "clip-rule")
  .replaceAll("currentColor", "#ffffff");
const card = ({ headline, tagline, footer }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#17132b"/><circle cx="1100" cy="100" r="330" fill="#8524d6" opacity=".22"/><circle cx="1090" cy="560" r="260" fill="#8524d6" opacity=".16"/><g transform="translate(72 68) scale(1.8)">${logo}</g><text x="285" y="99" fill="#d1b3ef" font-family="Arial,sans-serif" font-size="36">/ secrets</text>${headline.map((line, i) => `<text x="72" y="${225 + i * 72}" fill="white" font-family="Arial,sans-serif" font-weight="bold" font-size="58">${line}</text>`).join("")}<text x="72" y="380" fill="#d1b3ef" font-family="Arial,sans-serif" font-size="34">${tagline}</text><path d="M970 292v-45a45 45 0 0 1 90 0v45" fill="none" stroke="#d1b3ef" stroke-width="12"/><rect x="946" y="292" width="138" height="108" rx="20" fill="#8524d6"/><circle cx="1015" cy="336" r="10" fill="white"/><path d="M1015 345v20" stroke="white" stroke-width="9" stroke-linecap="round"/><path d="M72 493h1056" stroke="#443457"/><text x="72" y="550" fill="#c2b9cf" font-family="Arial,sans-serif" font-size="24">${footer}</text></svg>`;
const cards = {
  // The site itself: shown when someone shares the home page.
  "social-card": card({
    headline: ["Some things shouldn’t", "stay in chat."],
    tagline: "Send them encrypted. Reveal them once.",
    footer: "Browser-side encryption · One-time reveal · No account needed",
  }),
  // A one-time secret link (/s#…): tells the recipient this is a secret, not a site plug.
  "social-card-secret": card({
    headline: ["Someone sent you", "a secret."],
    tagline: "It can be viewed once, then it’s deleted.",
    footer:
      "Encrypted in the sender’s browser · Open it only when you’re ready",
  }),
};
for (const [name, svg] of Object.entries(cards)) {
  await writeFile(`public/${name}.svg`, svg);
  await sharp(Buffer.from(svg)).png().toFile(`public/${name}.png`);
}
