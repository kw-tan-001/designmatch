# Data-driven feature plan: personalised IDP recommendations

**Proposed feature:** a "Recommended for you" row on the discovery page and IDP detail page that suggests
projects each customer is likely to shortlist or enquire about.

This is a plan for the report. It is **not implemented** in this codebase. A rule-based baseline is
described in step 6 as an optional first increment; it would not be a machine-learning model and should
be labelled as such.

## 1. Why this feature

Customers currently find projects only through explicit search and filters. Engagement data already
captured by the platform (views, shortlists, enquiries, searches) shows what each customer is actually
drawn to. Recommendations aim to increase relevant discovery for customers and fairer exposure for
designers whose work matches a customer's taste.

## 2. Data collection (already in the schema)

| Signal | Table | Strength of interest |
|---|---|---|
| Project viewed | `idp_views (viewer_id, idp_id, viewed_at)` | weak |
| Project shortlisted | `favourites (customer_id, idp_id, created_at)` | strong |
| Designer contacted | `enquiries (customer_id, idp_id, created_at)` | strongest |
| Search terms and filters | `search_logs (account_id, keyword, filters)` | explicit preference |
| Project attributes | `idps` category, budget, location, property type; `idp_styles` | item features |
| Customer profile | `user_accounts.location` | context |

Additional events worth logging before modelling: recommendation impressions and clicks (needed to
evaluate the live feature), and time spent on a project page.

## 3. Cleaning and preprocessing

- Remove views by designers of their own projects (already excluded at capture) and by admin/manager accounts.
- Collapse repeated views of the same project by the same user within 30 minutes into one event.
- Drop suspended accounts and IDPs from unapproved/suspended designers.
- Bot filtering: ignore anonymous sessions with unrealistically many views per minute.
- Handle cold start: customers with fewer than 3 interactions fall back to popularity within their search filters.

## 4. Feature engineering

- **Implicit rating** per (customer, IDP): view = 1, shortlist = 3, enquiry = 5 (same weights as the platform's engagement score), decayed with a 60-day half-life.
- **Item vectors:** one-hot category, property type and design styles; normalised log budget mid-point; location region.
- **Customer taste profile:** weighted average of the item vectors they interacted with, plus filter frequencies from `search_logs`.
- **Popularity priors:** 30-day engagement per IDP, used for cold start and as a tie-breaker.

## 5. Recommendation approach

1. **Baseline (rule-based):** content similarity - cosine similarity between the customer taste profile and each IDP vector, filtered to a budget band around the customer's typical range, excluding projects already shortlisted.
2. **Model:** item-item collaborative filtering (customers who shortlisted X also shortlisted Y), or matrix factorisation (implicit ALS) once there are enough interactions.
3. **Hybrid:** blend the collaborative score with content similarity, so new IDPs with no interactions can still be recommended.

## 6. Training and evaluation data

- Time-based split: train on interactions before day T, test on the following 14 days (never random splits, which leak the future).
- Offline metrics: Precision@10, Recall@10, NDCG@10 and Hit-rate@10 on shortlists and enquiries in the test window; coverage (share of IDPs ever recommended); designer exposure distribution.
- Online metrics (A/B test of baseline vs model): click-through on recommendations, shortlist rate, enquiry rate per session.
- Success threshold agreed with the client before launch, e.g. +10% shortlist rate over the rule-based baseline.

## 7. Privacy, fairness and ethics

- Use only first-party behaviour on DesignMatch; no third-party tracking. State this in the privacy notice (PDPA).
- Customers can turn personalisation off and can clear their history; recommendations then fall back to non-personal popularity.
- Store model features keyed by account id only; never export personal data to the model environment.
- **Fairness:** popularity-based models reinforce already popular designers. Mitigate with a diversity re-ranker (at most two projects per designer in a list) and an exposure floor for newly approved designers; monitor the exposure distribution in the monthly report.
- Recommendations never include projects from unapproved or suspended designers.

## 8. Integration with the BCE architecture

| Layer | New class |
|---|---|
| Boundary | `GET /api/customer/recommendations`; "Recommended for you" row in `public/js/views/public.js` |
| Control | `ViewRecommendationsController` - applies business rules (visibility, exclusions, diversity) |
| Entity | `Recommendation` - reads a `recommendations (customer_id, idp_id, score, model_version, generated_at)` table |
| Offline job | nightly script `scripts/train_recommender.(py|js)` that reads the engagement tables, trains, evaluates against the previous model, and writes scores only if the new model is better |

Serving precomputed scores keeps request latency low and lets a failing model be rolled back by
switching `model_version`.

## 9. Monitoring and future improvements

- Weekly dashboard: CTR, shortlist rate from recommendations, coverage, designer exposure Gini coefficient.
- Alert if CTR drops by more than 20% week on week (data drift or a broken job).
- Retrain weekly; re-evaluate weights of views/shortlists/enquiries with the client.
- Future: image embeddings of project photos so visually similar interiors are recommended even without interactions.
