import { closeSync, openSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = parseEnv(readFileSync(resolve(root, ".env"), "utf8"));
const url = process.env.DATABASE_URL ?? env.DATABASE_URL;
if (url !== "file:./dev.db") {
  throw new Error('This local demo setup expects DATABASE_URL="file:./dev.db". It does not initialize other databases.');
}
try {
  // Exclusive creation: never truncate an existing database, even an empty one.
  closeSync(openSync(resolve(root, "dev.db"), "ax"));
  console.log("Created the local database file. Next run: npx prisma migrate deploy");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("The local database file already exists; its contents were preserved.");
}
