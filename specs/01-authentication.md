---
description: JWT authentication, password policy, user management, and first-run admin seeding.
status: active
---

# 01 — Authentication & User Management

Users sign in with username + password. The API issues a 7-day JWT accepted
via `Authorization: Bearer <token>` (or a `token` cookie). Roles: `admin` and
`leader`; admin-only endpoints are user management.

Code: `artifacts/api-server/src/routes/auth.ts`,
`artifacts/api-server/src/middlewares/auth.ts`,
`artifacts/api-server/src/lib/jwt.ts`, `artifacts/api-server/src/lib/password.ts`,
`artifacts/api-server/src/seed-admin.ts`.

## Schema

`users`: `id` (UUID pk), `username` (varchar 64, unique), `passwordHash`
(text, bcrypt), `displayName` (varchar 128), `role` (`admin` | `leader`,
default `admin`), `isActive` (bool, default true), `lastLoginAt` (nullable
timestamp), `createdAt`, `updatedAt`.

## Endpoints

| Method & path | Auth | Behavior |
|---|---|---|
| `POST /api/auth/login` | public | Validate `{username, password}`. 401 with generic "Invalid username or password" on unknown user, inactive user, or bad password. On success: sign JWT `{sub, username, role}`, set `lastLoginAt`, return `{token, user{id, username, displayName, role}}`. |
| `GET /api/auth/me` | required | Return current user (no `passwordHash`). 401 if user no longer exists. |
| `POST /api/auth/change-password` | required | Verify `currentPassword` (401 if wrong), validate `newPassword` strength (400), update hash. |
| `GET /api/auth/users` | admin | List users ordered by username (no hashes). |
| `POST /api/auth/users` | admin | Create user: `username` regex `^[a-zA-Z0-9._-]+$` 3–64 chars, unique (409 on taken), `displayName`, `password` (strength-checked), `role` default `leader`. 201. |
| `PATCH /api/auth/users/:id` | admin | Partial update of `displayName`/`role`/`isActive`/`password` (at least one field). 404 if missing. **Last-admin guard**: an admin cannot demote themselves to `leader` or set their own `isActive=false` (409). |
| `DELETE /api/auth/users/:id` | admin | Delete user. 409 if it is their own account. |

## Auth middleware

- `authMiddleware` (app-wide, **optional**): parses Bearer token or `token`
  cookie, verifies JWT, loads the user; attaches `req.userId`, `req.username`,
  `req.userRole`. Never blocks; invalid/expired tokens → unauthenticated.
- `requireAuth`: 401 if no valid identity.
- `requireAdmin`: 401 if unauthenticated, 403 if role ≠ `admin`.

## Password policy (shared, applied everywhere a password is set)

- 8–128 characters; must contain at least one letter and one number.
- bcrypt (bcryptjs), cost 10.

## JWT

- Signed with `JWT_SECRET` (env). If unset at runtime, token sign/verify
  **throws** — the deployment layer guarantees it is set (see
  `16-docker-deployment.md`: entrypoint persists a generated secret to
  `/app/data/.jwt-secret`).
- Expiry: 7 days.

## First-run admin seed

`seed-admin.ts` (run by db-init on every boot, idempotent):

- Seeds **only** when the `users` table is empty.
- Uses `DEFAULT_ADMIN_USERNAME` (default `admin`) and
  `DEFAULT_ADMIN_PASSWORD` (default `ChangeMe123!`).
- **Refuses** to seed a password that fails the strength policy.
- Never overwrites existing users.

## Configuration

| Property | Default | Notes |
|---|---|---|
| `JWT_SECRET` | generated once → `/app/data/.jwt-secret` | required for auth endpoints |
| `DEFAULT_ADMIN_USERNAME` | `admin` | first-run seed only |
| `DEFAULT_ADMIN_PASSWORD` | `ChangeMe123!` | first-run seed only; must pass strength check |
| bcrypt cost | `10` | `BCRYPT_ROUNDS` in `lib/password.ts` |
| token lifetime | `7d` | `lib/jwt.ts` |

## Testing

- Login: valid credentials → token + user; wrong password → 401 generic
  message; inactive user → 401; unknown user → 401 (no user-existence leak).
- `change-password`: wrong current → 401; weak new password → 400 with
  policy message; success → login works with new password.
- User management: non-admin gets 403 on `/auth/users*`; admin create → 201,
  duplicate username → 409; self-delete → 409; self-demote/self-disable → 409.
- Token expiry / garbage token → request treated as unauthenticated (401 on
  protected routes).
- Seed: empty users table → admin created; non-empty → no-op; weak
  `DEFAULT_ADMIN_PASSWORD` → seed skipped with warning.

## Acceptance Criteria

- [ ] `POST /auth/login` returns `{token, user}` and updates `lastLoginAt`.
- [ ] All protected routes return 401 without a valid token.
- [ ] `/auth/users*` require the `admin` role (403 otherwise).
- [ ] Password policy (8–128 chars, letter + number) enforced on create,
      change, and admin-set passwords.
- [ ] Admin cannot delete, demote, or disable their own admin account.
- [ ] First-run seed creates exactly one admin and is idempotent.
- [ ] `passwordHash` never appears in any API response.

## Open Questions

None.
