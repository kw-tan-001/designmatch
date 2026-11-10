# DesignMatch - Interior Design Matching Platform

![CI/CD](https://github.com/<you>/<repo>/actions/workflows/ci.yml/badge.svg)

<!-- Replace <you>/<repo> with your GitHub repository after the first push. -->

CSIT314 Software Development Methodologies group project (SIM / University of Wollongong).
A database-driven web platform that matches renovation customers with interior designers, built with
the Boundary-Control-Entity (BCE) architecture and covering all 60 user stories.

| | |
|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript (single-page app, no framework) |
| Backend | Node.js 18+, Express 4, object-oriented BCE layers |
| Database | PostgreSQL 13+ (tested on 16) |
| Tests | Jest + Supertest, coverage threshold 70% lines |
| Test data | Faker (`scripts/generate_test_data.js`) |
| CI/CD | GitHub Actions -> Render |

## Quick start

```bash
cp .env.example .env               # edit DATABASE_URL / TEST_DATABASE_URL / SESSION_SECRET
createdb designmatch
createdb designmatch_test
npm install
npm run db:reset                   # build schema and load demo data
npm start                          # open http://localhost:3000
npm test                           # run the test suite
npm run verify:stories             # check all 60 user stories against the running app
```

## Demo accounts (development data only)

| Role | Email | Password |
|---|---|---|
| User Admin | admin@designmatch.sg | Admin123! |
| Interior Designer | designer@designmatch.sg | Designer123! |
| Customer | customer@designmatch.sg | Customer123! |
| Platform Management | manager@designmatch.sg | Manager123! |
| Designer awaiting approval | pending.designer@designmatch.sg | Designer123! |

All Faker-generated accounts use the password `Password123`. These credentials exist only in seeded
development data - never reuse them in a real deployment's real accounts.

## Project structure

```
db/migrations/          SQL schema (001) and reference data (002); db/migrate.js applies them
src/
  boundary/routes/      API Boundary - Express routes per actor
  middleware/           Boundary middleware - auth/RBAC, uploads, error handling
  control/              Control layer - one class per use case, grouped by actor
  entity/               Entity layer - one class per table, parameterised SQL
  services/             Shared helpers used by controls (passwords, files, report export)
  config/, utils/       Configuration, DB pool, validation, dates, AppError
public/                 UI Boundary - index.html, css, js/views per actor
scripts/                Faker seeder, syntax check
tests/unit/             Control-layer and utility unit tests (no DB)
tests/integration/      API tests with Supertest against a test database
docs/                   Architecture, schema, data dictionary, API, story coverage, testing, deployment, data-driven plan
```

## Documentation

- [Story coverage - all 60 stories mapped to UI, API, Control, Entity and tests](docs/story-coverage.md)
- [Architecture (BCE)](docs/architecture.md) - includes decisions to confirm against your UML
- [Database schema](docs/database-schema.md) and [data dictionary](docs/data-dictionary.md)
- [API documentation](docs/api-documentation.md)
- [Testing and TDD evidence guide](docs/testing.md)
- [CI/CD and deployment](docs/deployment.md)
- [Data-driven feature plan](docs/data-driven-development.md)

## Walkthroughs for the demo video

1. **Customer:** register, log in, search with filters, open a project, save it, send an enquiry; log out and back in - the favourite is still there.
2. **Designer:** log in, edit company profile and logo, add a project with photos and tags, check views and shortlists, read enquiries. Log in as another designer and confirm you cannot edit the first designer's projects (403).
3. **User Admin:** log in, search accounts, approve `pending.designer@designmatch.sg`, suspend an account and confirm that user is locked out, create and suspend a user profile.
4. **Platform Management:** log in, manage categories, view membership statistics, generate a weekly report, export PDF and CSV; compare a figure with `psql` to show it matches the database.

## Interface

The design follows a studio-magazine direction: deep umber sections, light uppercase Montserrat headings with open
tracking, Montserrat text, square photography and underlined calls to action. Montserrat loads from Google Fonts
(allowed in the Content Security Policy); without a connection the site falls back to the system sans-serif. Navigation opens as a full-screen menu on every screen size.

- **Discover:** keywords match every word in any order; each filter option shows how many projects it would return;
  active filters appear as removable chips; an empty result lists which filter to drop and how many projects that brings back.
  The budget filter shows projects whose whole quoted range fits inside your budget (for example "Up to $80k" returns
  projects quoted between $0 and $80k), so higher limits always return more projects.
- **User Admin console:** overview dashboard, live approvals badge (refreshes after each change, on tab focus and
  every 30 seconds), bulk suspend/reactivate, CSV export of the filtered account list, and an activity log of every admin change.

## Images

The demo has 160 projects. 19 are hand-written (`PROJECTS` in `scripts/generate_test_data.js`), each with its own title,
room, styles, budget and photos; the three whole-home projects show five or six rooms each. The other 141 are generated
from the same photos, grouped by room type, so every project has a fitting cover and a unique title. The total is set by
`COUNTS.idps`. To add a hand-written project, put its photos in `public/img/rooms/`, add an entry to `PROJECTS` (the
first photo becomes the cover) and run `npm run db:reset`. Designers can also upload photos
(JPEG, PNG or WebP) or link to images online from the studio dashboard.