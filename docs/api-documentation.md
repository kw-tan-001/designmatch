# API documentation

Base path `/api`. JSON in and out unless stated. Errors return `{ "error": "message" }` with the status
codes below. Authentication uses the `dm.sid` session cookie set by `POST /api/auth/login`.

| Status | Meaning |
|---|---|
| 200 / 201 | Success / created |
| 400 | Validation failed (message explains which field) |
| 401 | Not logged in, or invalid credentials |
| 403 | Logged in but not allowed (wrong role, missing permission, suspended, not owner, pending approval). `code: PASSWORD_CHANGE_REQUIRED` after an admin reset |
| 404 | Not found, or not visible to this user |
| 409 | Conflict (duplicate email/name/favourite, already approved, ...) |
| 413 / 429 | Body too large / too many attempts |

## Authentication and self-service (any actor)

| Method & path | Body / query | Story |
|---|---|---|
| POST /auth/login | `email, password` -> `{ user }` | 5, 18, 36, 54 |
| POST /auth/logout | | 6, 28, 42, 55 |
| GET /auth/me | -> `{ user }` or `{ user: null }` | |
| POST /auth/register/customer | `email, password, fullName, phone?, location?` | 35 |
| POST /auth/register/designer | `email, password, fullName, phone, companyName, licenseNumber, yearsExperience, specialisation?, bio?` | 17 |
| PUT /auth/me | `fullName?, email?, phone?, location?` | 18, 36 |
| PUT /auth/me/password | `currentPassword, newPassword` | 18, 36, 4 |

## Public discovery (no login)

| Method & path | Query / notes | Story |
|---|---|---|
| GET /meta | categories, styles, property types, locations, sort options | |
| GET /idps | `keyword, categoryId, budgetMin, budgetMax, location, styleIds (comma list), propertyTypeId, designerId, status, sort (newest, oldest, most_viewed, most_favourited, budget_low, budget_high), page, pageSize` -> `{ results, total, page, pageSize, totalPages }`. Logged to search_logs on page 1. Keywords are split into words; every word must match (title, description, location, studio, room, property type or style) in any order, and simple plurals match. `facets=1` adds `facets` (option counts per room, property type, style, status and location, each counted with the other filters applied) and, when nothing matches, `suggestions: [{ remove, total }]` naming the filters whose removal brings results back | 37, 43, 44, 45 |
| GET /idps/:id | Full details + photos; records a view | 38 |
| GET /designers | `limit` - approved designers by engagement | |
| GET /designers/:id | Company page: company, designer, certifications, first IDPs | 46 |
| GET /designers/:id/idps | `page, pageSize, sort, status` | 47 |

## Customer (`/customer`, role customer)

| Method & path | Body / query | Story |
|---|---|---|
| GET /customer/favourites | `q?` (search within favourites) | 40, 48 |
| GET /customer/favourites/ids | ids of saved IDPs | 40 |
| POST /customer/favourites | `idpId` | 39 |
| DELETE /customer/favourites/:idpId | | 40 |
| POST /customer/enquiries | `idpId, message, contactPhone?` | 41 |
| GET /customer/enquiries | enquiries the customer sent | 41 |

## Interior Designer (`/designer`, role designer)

| Method & path | Body / query | Story |
|---|---|---|
| GET, PUT /designer/profile | `licenseNumber, yearsExperience, specialisation, bio` | 18 |
| GET /designer/company | | 29 |
| PUT /designer/company | multipart: `companyName, description, contactEmail, contactPhone, website, address, serviceAreas (JSON array), logo (file), removeLogo` | 19 |
| GET /designer/company/preview | customer view of own page | 30 |
| POST /designer/company/certifications | `title, issuer, yearObtained?` | 20 |
| DELETE /designer/company/certifications/:id | | 20 |
| GET /designer/idps | `q, status, categoryId (or none), sort, page` | 32, 25, 26 |
| GET /designer/idps/:id | own IDP only | 31 |
| POST /designer/idps | multipart or JSON: `title, description, location, status, categoryId, budgetMin, budgetMax, propertyTypeId, styleIds, photos (files), photoUrls` | 21, 24, 33 |
| PUT /designer/idps/:id | same fields (all optional) + `removePhotoIds` | 23 |
| DELETE /designer/idps/:id | | 23 |
| PATCH /designer/idps/:id/status | `status: current\|past` | 22 |
| PATCH /designer/idps/:id/category | `categoryId` | 24 |
| PUT /designer/idps/:id/tags | `styleIds[], propertyTypeId` | 33 |
| GET /designer/analytics/views | per-IDP views, last 30 days, last viewed | 25 |
| GET /designer/analytics/shortlists | per-IDP shortlists | 26 |
| GET /designer/dashboard | totals, 14-day trend, by category, top IDPs | 27 |
| GET /designer/enquiries | `status (new\|read), page` | 34 |
| PATCH /designer/enquiries/:id/read | | 34 |

## User Admin (`/admin`, role admin; permission in brackets)

| Method & path | Body / query | Story |
|---|---|---|
| GET /admin/accounts [accounts.view] | no filters = list all (1); `q, role, status` = search (10); `page, pageSize` | 1, 10 |
| GET /admin/accounts/:id [accounts.view] | | 8 |
| POST /admin/accounts [accounts.manage] | `email, fullName, profileId, phone?, location?, password?` -> `{ account, temporaryPassword }` | 7 |
| PUT /admin/accounts/:id [accounts.manage] | `fullName, email, phone, location, profileId (same role)` | 9 |
| PATCH /admin/accounts/:id/status [accounts.manage] | `status: active\|suspended` | 2 |
| POST /admin/accounts/:id/reset-password [accounts.manage] | -> `{ temporaryPassword }` (shown once) | 4 |
| GET /admin/registrations [registrations.review] | `status: pending (default)\|approved\|rejected\|all` | 3 |
| POST /admin/registrations/:id/approve [registrations.review] | | 3 |
| POST /admin/registrations/:id/reject [registrations.review] | `reason` (10-500 chars) | 11 |
| GET /admin/permissions [profiles.manage] | permission catalogue per role | 12 |
| GET /admin/profiles | `q, role` | 16 |
| GET /admin/profiles/:id | permissions with labels | 13 |
| POST /admin/profiles [profiles.manage] | `name, role, description, permissions[]` | 12 |
| PUT /admin/profiles/:id [profiles.manage] | `name, description, permissions[]` | 14 |
| PATCH /admin/profiles/:id/status [profiles.manage] | `suspended: true\|false` | 15 |
| GET /admin/overview [accounts.view] | totals, accounts by role, 30-day sign-up trend, newest accounts, approval queue, recent activity | console |
| GET /admin/activity [accounts.view] | `q, action (exact, or group prefix account. / registration. / profile.), page, pageSize` | console |
| GET /admin/accounts/export.csv [accounts.view] | `q, role, status` (same filters as the list) -> CSV download, formula-safe | console |
| POST /admin/accounts/bulk-status [accounts.manage] | `accountIds[] (max 100), status` -> `{ updated, skipped[{ account_id, reason }], message }`; your own account is skipped | 2 (bulk) |

Every change made through the User Admin endpoints (create, update, suspend, reactivate, reset password,
approve, reject, profile create/update/suspend) is written to `admin_audit_log` and shown in the activity log.

## Platform Management (`/manager`, role manager)

| Method & path | Body / query | Story |
|---|---|---|
| GET /manager/stats [stats.view] | users by role, registrations, monthly growth | 49 |
| GET /manager/categories [categories.manage] | `q?` | 56, 57 |
| POST /manager/categories | `name, description` | 50 |
| PUT /manager/categories/:id | `name?, description?` | 50 |
| DELETE /manager/categories/:id | IDPs become uncategorised | 50 |
| POST /manager/reports/daily [reports.generate] | `date` (default today) | 51 |
| POST /manager/reports/weekly | `weekStart` (any date in the week) | 52 |
| POST /manager/reports/monthly | `month` (YYYY-MM) | 53 |
| POST /manager/reports/custom | `start, end` (max 366 days) | 58 |
| GET /manager/reports | `type?, page` | 59 |
| GET /manager/reports/:id | full report data | 59 |
| GET /manager/reports/:id/export | `format=csv\|pdf` -> file download | 60 |

## Health

`GET /api/health` -> `{ status: "ok" }` (used by the deployment smoke test).
