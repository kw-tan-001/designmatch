# Architecture: Boundary-Control-Entity (BCE)

DesignMatch follows the BCE framework taught in CSIT314. Every request travels in one direction:

```
Actor --> Boundary --> Control --> Entity --> PostgreSQL
          (UI + API)   (use case)  (persistence)
```

## Layers and folders

| Layer | Folder | Responsibility | May call |
|---|---|---|---|
| UI Boundary | `public/js/views/*.js`, `public/js/app.js`, `public/js/ui.js` | Render pages and forms, read user input, basic format checks, show success/error messages | API boundary only, through `public/js/api.js` (HTTP) |
| API Boundary | `src/boundary/routes/*.js`, `src/middleware/*.js` | Receive HTTP requests, authenticate the session, check role/permission, parse JSON and multipart uploads, call one Control class, map results and `AppError` to HTTP responses | Control classes |
| Control | `src/control/<actor>/*.js` | One class per use case. Business rules, validation of business data, ownership checks, workflows and transactions | Entity classes, services (`src/services`) |
| Entity | `src/entity/*.js` | One class per domain concept / table. Parameterised SQL only | `src/config/db.js` |
| Database | `db/migrations/*.sql` | Tables, keys, constraints, cascades, indexes | |

Rules enforced in the code:

1. The browser never touches the database. All screens call the REST API.
2. Route files contain no SQL and no business rules. Each route handler is two or three lines: read
   input, call `controller.execute(...)`, send the result.
3. Only Entity classes import `src/config/db.js` (the one exception is the transaction helper,
   `db.withTransaction`, which Control classes use to group several Entity calls atomically -
   the SQL itself still lives in the entities).
4. Control classes never read `req`/`res`. They receive plain values and the acting user
   (`actor`), and either return data or throw `AppError(status, message)`.
5. Authorisation is checked twice: the route enforces role + permission
   (`requireRole`, `requirePermission`), and the controller enforces data ownership
   (e.g. `assertOwnership` in `IDPControllers.js` stops a designer editing another designer's IDP).

You can verify rule 3 with: `grep -rl "config/db" src | grep -v entity` - the only matches are the
transaction-using controllers, `app.js` (session store) and `db/migrate.js`.

## Example: "Save an IDP to favourites" (story 39)

```
Customer clicks heart        UI Boundary    public/js/app.js        App.toggleFavourite()
  POST /api/customer/favourites {idpId}
                             API Boundary   customerRoutes.js       requireRole('customer'), requirePermission('favourites.manage')
                             Control        SaveFavouriteController.execute(actor, idpId)
                                              - IDP must be publicly visible, else 404
                                              - duplicate favourite -> 409
                             Entity         IDP.findById(id, {publicOnly:true})
                                            Favourite.add(customerId, idpId)   INSERT ... ON CONFLICT DO NOTHING
                             Database       favourites (UNIQUE customer_id, idp_id)
  201 {message}  ->  toast "saved to your favourites"
```

## Example: "Approve designer registration" (story 3)

```
User Admin -> RegistrationApprovalPage -> POST /api/admin/registrations/:id/approve
  -> adminRoutes.js (requireRole admin, requirePermission registrations.review)
  -> ApproveInteriorDesignerRegistrationController.execute(actor, designerId)
       rule: already approved -> 409
  -> InteriorDesigner.approve(designerId, reviewerId)   UPDATE interior_designers ...
```

## Dependency injection for testing

Every Control class takes an optional `deps` object (`new LoginController({ UserAccount: fake })`).
Production code uses the real Entity classes; unit tests pass in-memory fakes so business rules are
tested without a database (`tests/unit/controllers.test.js`). Integration tests then run the full
Boundary-Control-Entity chain against a real test database (`tests/integration/`).

## Security design

- Passwords: bcrypt hashes only (`PasswordService`); admins can issue a one-time temporary password but never read one.
- Sessions: `express-session` stored in PostgreSQL (`user_sessions`), `httpOnly` + `sameSite=strict` cookies, id regenerated at login.
- Every request re-validates the session account through `AuthenticateSessionController`, so a suspended account or profile loses access immediately.
- Role + permission checks on the server (`src/middleware/auth.js`), ownership checks in Control classes.
- Parameterised SQL everywhere; `LIKE` wildcards in user search terms are escaped.
- Uploads: JPEG/PNG/WebP only, 5 MB each, random file names (`src/middleware/upload.js`).
- `helmet` security headers with a Content Security Policy; `express-rate-limit` on login/registration/password endpoints.
- CSV exports neutralise spreadsheet formula injection.

## Decisions and assumptions to confirm against the group report

The group report was not available when this code was written, so these choices should be checked
against your UML and changed (or the report updated) so design and code stay consistent:

| Topic | Decision taken here | Why |
|---|---|---|
| Shared log-in/log-out stories | One `LoginController` and one `LogoutController` for all four actors | Same use case; avoids four identical classes |
| Search stories 37, 43, 44, 45 | One `SearchIDPsController` with combinable criteria | One search form applies all filters together |
| Pending/rejected designers | Cannot log in until approved; rejected designers see the reason | Matches "unapproved designers must not be presented as verified" |
| Admin-created designer accounts | Approved automatically, with a starter company profile | The admin is the reviewer |
| Deleting a category | IDPs become "Uncategorised" (FK `ON DELETE SET NULL`) | Never deletes designers' work |
| Deleting an IDP | Photos, favourites, views, enquiries removed by `ON DELETE CASCADE` | No orphaned records |
| Engagement score for "top performing" | views + 3 x shortlists + 5 x enquiries | Weights deeper intent more; documented in every report |
| Report periods | Calendar dates in `Asia/Singapore`; weeks run Monday to Sunday | Local business calendar |
| View counting | Every detail-page view is recorded, except the owner viewing their own IDP | Owner views would inflate analytics |
