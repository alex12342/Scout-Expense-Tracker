/**
 * First-run admin seed. Safe to run on every boot:
 *   - creates the admin user ONLY when the users table is empty
 *     AND DEFAULT_ADMIN_USERNAME + DEFAULT_ADMIN_PASSWORD are set
 *   - never overwrites an existing user
 *
 * Run via:  node dist/seed-admin.mjs
 */
import { db, usersTable, getPool } from "@scout-expense-tracker/db";
import { count } from "drizzle-orm";
import { hashPassword } from "./lib/password";
import { validatePasswordStrength } from "./lib/password";

async function main() {
  const username = process.env.DEFAULT_ADMIN_USERNAME?.trim();
  const password = process.env.DEFAULT_ADMIN_PASSWORD;

  if (!username || !password) {
    console.log("[seed] DEFAULT_ADMIN_USERNAME/PASSWORD not set — skipping admin seed");
    return;
  }

  const [{ n }] = await db
    .select({ n: count() })
    .from(usersTable);

  if (n > 0) {
    console.log("[seed] users table already populated — skipping admin seed");
    return;
  }

  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    console.warn(`[seed] WARNING: ${strength.message}. Refusing to seed weak password.`);
    console.warn("[seed] Set a stronger DEFAULT_ADMIN_PASSWORD or create the user in the UI.");
    return;
  }

  const passwordHash = await hashPassword(password);
  await db.insert(usersTable).values({
    username,
    displayName: "Troop Admin",
    role: "admin",
    isActive: true,
    passwordHash,
  });

  console.log(`[seed] Created initial admin user: ${username}`);
  console.log("[seed] CHANGE THIS PASSWORD after first login.");
}

main()
  .then(async () => {
    await getPool().end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[seed] FAILED:", err);
    try {
      await getPool().end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
