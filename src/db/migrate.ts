#!/usr/bin/env bun
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SQL } from "bun";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "migrations");

async function main() {
  const sql = new SQL(DATABASE_URL!);
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    const rows = (await sql`SELECT filename FROM schema_migrations`) as Array<{
      filename: string;
    }>;
    const applied = new Set<string>(rows.map((r) => r.filename));

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let applyCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`✓ ${file} (already applied)`);
        continue;
      }
      const sqlText = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`→ applying ${file}...`);
      await sql.begin(async (tx) => {
        await tx.unsafe(sqlText);
        await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
      });
      applyCount += 1;
      console.log(`✓ ${file} applied`);
    }

    console.log(applyCount > 0 ? `Done. ${applyCount} migration(s) applied.` : "Up to date.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
