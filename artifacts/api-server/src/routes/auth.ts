import { Router } from "express";
import { z } from "zod";
import { db, usersTable } from "@scout-expense-tracker/db";
import { eq } from "drizzle-orm";
import { verifyPassword, hashPassword, validatePasswordStrength } from "../lib/password";
import { signToken } from "../lib/jwt";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

// POST /login — authenticate, return a JWT.
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid credentials format" });
    return;
  }
  const { username, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const token = signToken({
    sub: user.id,
    username: user.username,
    role: user.role,
  });

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

  logger.info({ username }, "User logged in");

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
  });
});

// GET /me — current user.
router.get("/me", requireAuth, async (req, res) => {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId))
    .limit(1);
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }
  const { passwordHash, ...safe } = user;
  res.json(safe);
});

// POST /change-password
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
});

router.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId))
    .limit(1);
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const strength = validatePasswordStrength(parsed.data.newPassword);
  if (!strength.valid) {
    res.status(400).json({ error: strength.message });
    return;
  }

  await db
    .update(usersTable)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword) })
    .where(eq(usersTable.id, user.id));

  res.json({ ok: true });
});

// ── User management (admin only) ────────────────────────────────────────────

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dot, dash, underscore"),
  displayName: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(128),
  role: z.enum(["admin", "leader"]).default("leader"),
});

router.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      role: usersTable.role,
      isActive: usersTable.isActive,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.username);
  res.json(users);
});

router.post("/users", requireAuth, requireAdmin, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid user", issues: parsed.error.flatten() });
    return;
  }
  const strength = validatePasswordStrength(parsed.data.password);
  if (!strength.valid) {
    res.status(400).json({ error: strength.message });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, parsed.data.username))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      passwordHash: await hashPassword(parsed.data.password),
      role: parsed.data.role,
    })
    .returning();

  res.status(201).json(user);
});

const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(1).max(128).optional(),
    role: z.enum(["admin", "leader"]).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(1).max(128).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

router.patch("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid user", issues: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;

  const updates: {
    displayName?: string;
    role?: "admin" | "leader";
    isActive?: boolean;
    passwordHash?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (parsed.data.displayName !== undefined) updates.displayName = parsed.data.displayName;
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  if (parsed.data.password !== undefined) {
    const strength = validatePasswordStrength(parsed.data.password);
    if (!strength.valid) {
      res.status(400).json({ error: strength.message });
      return;
    }
    updates.passwordHash = await hashPassword(parsed.data.password);
  }

  // Don't allow demoting/disabling the last active admin.
  if (
    String(req.params.id) === req.userId &&
    (parsed.data.role === "leader" || parsed.data.isActive === false)
  ) {
    const [me] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId))
      .limit(1);
    if (me?.role === "admin") {
      res.status(409).json({ error: "Cannot demote or disable your own admin account" });
      return;
    }
  }

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, String(req.params.id)))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { passwordHash, ...safe } = user;
  res.json(safe);
});

router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  if (String(req.params.id) === req.userId) {
    res.status(409).json({ error: "You cannot delete your own account" });
    return;
  }
  const [user] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, String(req.params.id)))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
