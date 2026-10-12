import { copyFile, constants } from "node:fs/promises";
// Wrangler configs are gitignored; create them from the committed templates.
// Existing operator configuration is never overwritten.
for (const [source, destination] of [
  ["wrangler.example.toml", "wrangler.toml"],
  ["cleanup/wrangler.example.toml", "cleanup/wrangler.toml"],
]) {
  try {
    await copyFile(source, destination, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}
