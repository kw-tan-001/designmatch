# CI/CD and deployment

Pipeline file: `.github/workflows/ci.yml` (GitHub Actions). Hosting: Render (`render.yaml`).

## Pipeline

Every push and pull request to `main` or `develop` runs the stages in order. A stage only starts when the
one before it passed, so a broken change never reaches deployment.

| Stage | Job | What it does | Fails when |
|---|---|---|---|
| 1 | Lint | Installs dependencies, syntax-checks every `.js` file (`npm run lint`) | Any file has a syntax error |
| 2 | Unit tests | Runs the Control-layer unit tests (`npm run test:unit`), no database | Any business rule test fails |
| 3 | Integration tests + coverage | Starts PostgreSQL 16, runs every test with coverage (`npm run test:coverage`), writes a coverage table on the run page, uploads the HTML report | A test fails, or coverage drops below the thresholds in `jest.config.js` (70% lines) |
| 4 | Verify 60 user stories | Starts PostgreSQL, loads Faker demo data, starts the app, runs `npm run verify:stories`, shows the 60 PASS/FAIL lines on the run page | Any story fails |
| 5 | Deploy | `main` only: calls the Render deploy hook, then waits until `/api/health` reports the new commit and a search request works | The new version is not live within 10 minutes |

Pull requests run stages 1 to 4 only. Merging into `main` runs all five.

## One-time setup

1. **Create the repository.** On GitHub, create a repository (private is fine) and add every team member.
   Then on one machine:
   ```bash
   cd designmatch
   npm install                      # creates package-lock.json - commit it
   git init -b main
   git add . && git commit -m "Initial DesignMatch code"
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   git switch -c develop && git push -u origin develop
   ```
   The first push starts the pipeline. Stage 5 fails until step 3 is done; that is expected.
2. **Protect `main`.** Settings > Branches > Add rule for `main`: require a pull request before merging, and
   require the status checks "1. Lint", "2. Unit tests", "3. Integration tests + coverage" and
   "4. Verify all 60 user stories" to pass.
3. **Connect Render.**
   - render.com > New > Blueprint > pick the repository. `render.yaml` creates the web service and a
     PostgreSQL database, generates `SESSION_SECRET` and runs migrations on every build.
   - Web service > Settings > Deploy Hook > copy the URL.
   - GitHub > Settings > Secrets and variables > Actions: add secret `RENDER_DEPLOY_HOOK_URL` (the hook)
     and variable `APP_URL` (for example `https://designmatch.onrender.com`).
   - GitHub > Settings > Environments > New environment `production`.
4. **Load demo data on the live site** (once, from your machine):
   `DATABASE_URL="<Render external database URL>" npm run seed`

## Team workflow

1. Pick a Taiga story, create a branch: `git switch -c feature/39-save-favourite develop`.
2. Write or update the test, see it fail, write the code, see it pass. Commit each step.
3. Push and open a pull request into `develop`. The template asks for the story number and test evidence.
4. Another member reviews; the pipeline must be green before merging.
5. At the end of each sprint, open a pull request from `develop` into `main`. Merging it deploys.

## Evidence for the report

Take these screenshots after the steps above have actually run:

| Screenshot | Where |
|---|---|
| Pipeline file | `.github/workflows/ci.yml` in GitHub |
| A pull request with all checks green | The pull request page, "All checks have passed" |
| The five stages of a `main` run | Actions > the run > the job graph |
| Coverage table and 60 story results | The same run, summary section |
| A blocked pull request | Push a branch with a failing test; the merge button is disabled |
| The live site | Your `APP_URL` in the browser, logged in as each role |
| Commit history by several members | Insights > Contributors, or the commit list |

Only describe in the report what you have seen run.

## Running locally

```bash
cp .env.example .env               # set DATABASE_URL and SESSION_SECRET
createdb designmatch
npm install
npm run db:reset                   # migrate from scratch + seed demo data
npm start                          # http://localhost:3000
```
