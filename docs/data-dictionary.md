# Data dictionary

PK = primary key, FK = foreign key, NN = not null, U = unique. Timestamps are `TIMESTAMPTZ` and default to `NOW()`.

## user_profiles
| Column | Type | Constraints | Description |
|---|---|---|---|
| profile_id | SERIAL | PK | |
| name | VARCHAR(60) | NN, U | Profile name, e.g. "Interior Designer" |
| role | VARCHAR(20) | NN, CHECK admin/designer/customer/manager | Actor role the profile grants |
| description | VARCHAR(500) | NN | |
| permissions | TEXT[] | NN | Permission codes (see below) |
| is_suspended | BOOLEAN | NN, default false | Suspended profiles block all their accounts (story 15) |
| created_at, updated_at | TIMESTAMPTZ | NN | |

Permission codes: `accounts.view`, `accounts.manage`, `registrations.review`, `profiles.manage` (admin);
`company.manage`, `idp.manage`, `analytics.view`, `enquiries.view` (designer);
`favourites.manage`, `enquiries.send` (customer); `stats.view`, `categories.manage`, `reports.generate` (manager).

## user_accounts
| Column | Type | Constraints | Description |
|---|---|---|---|
| account_id | SERIAL | PK | |
| profile_id | INTEGER | NN, FK user_profiles RESTRICT | |
| email | VARCHAR(255) | NN, U (case-insensitive) | Login name, stored lower-case |
| password_hash | VARCHAR(255) | NN | bcrypt hash, never returned by the API |
| full_name | VARCHAR(120) | NN | |
| phone | VARCHAR(30) | | |
| location | VARCHAR(80) | | Customer's area |
| status | VARCHAR(20) | NN, CHECK active/suspended | Story 2 |
| must_change_password | BOOLEAN | NN, default false | Set after an admin reset (story 4) |
| last_login_at | TIMESTAMPTZ | | |
| created_at, updated_at | TIMESTAMPTZ | NN | created_at drives "new users" in reports |

## interior_designers
| Column | Type | Constraints | Description |
|---|---|---|---|
| designer_id | INTEGER | PK, FK user_accounts CASCADE | Same id as the account |
| registration_status | VARCHAR(20) | NN, CHECK pending/approved/rejected | Stories 3, 11 |
| rejection_reason | VARCHAR(500) | required when rejected | |
| reviewed_by | INTEGER | FK user_accounts SET NULL | Admin who reviewed |
| reviewed_at | TIMESTAMPTZ | | |
| license_number | VARCHAR(60) | | Professional registration |
| years_experience | INTEGER | NN, 0-70 | |
| specialisation | VARCHAR(120) | | |
| bio | VARCHAR(2000) | | Professional summary |

## companies / company_service_areas / certifications
| Table.Column | Type | Constraints | Description |
|---|---|---|---|
| companies.company_id | SERIAL | PK | |
| companies.designer_id | INTEGER | NN, U, FK interior_designers CASCADE | One company per designer |
| companies.company_name | VARCHAR(150) | NN | |
| companies.description | VARCHAR(3000) | NN | |
| companies.logo_url | VARCHAR(500) | | `/uploads/<random>.png` or external URL |
| companies.contact_email, contact_phone, website, address | VARCHAR | | |
| company_service_areas.(company_id, area_name) | INTEGER, VARCHAR(80) | PK, FK companies CASCADE | Regions served |
| certifications.certification_id | SERIAL | PK | |
| certifications.company_id | INTEGER | NN, FK companies CASCADE | |
| certifications.title, issuer | VARCHAR(150) | NN | |
| certifications.year_obtained | INTEGER | 1950-2100 | |

## idp_categories / design_styles / property_types
| Table.Column | Type | Constraints |
|---|---|---|
| idp_categories.category_id | SERIAL | PK |
| idp_categories.name | VARCHAR(80) | NN, U (case-insensitive) |
| idp_categories.description | VARCHAR(500) | NN |
| design_styles.style_id / name | SERIAL / VARCHAR(60) | PK / NN, U |
| property_types.property_type_id / name | SERIAL / VARCHAR(60) | PK / NN, U |

Controlled values (record counts): 8 categories, 10 design styles, 5 property types, 4 default profiles.

## idps / idp_styles / idp_photos
| Table.Column | Type | Constraints | Description |
|---|---|---|---|
| idps.idp_id | SERIAL | PK | |
| idps.designer_id | INTEGER | NN, FK interior_designers CASCADE | Owner |
| idps.category_id | INTEGER | FK idp_categories SET NULL | NULL = Uncategorised |
| idps.property_type_id | INTEGER | FK property_types SET NULL | |
| idps.title | VARCHAR(150) | NN | |
| idps.description | TEXT | NN | |
| idps.status | VARCHAR(10) | NN, CHECK current/past | Story 22 |
| idps.budget_min, budget_max | INTEGER | NN, min >= 0, max >= min | S$ |
| idps.location | VARCHAR(80) | NN | Neighbourhood |
| idps.created_at, updated_at | TIMESTAMPTZ | NN | created_at drives "new IDPs" |
| idp_styles.(idp_id, style_id) | INTEGER | PK, FKs CASCADE | Story 33 |
| idp_photos.photo_id | SERIAL | PK | |
| idp_photos.idp_id | INTEGER | NN, FK idps CASCADE | |
| idp_photos.url | VARCHAR(500) | NN | |
| idp_photos.caption | VARCHAR(200) | NN | |
| idp_photos.sort_order | INTEGER | NN | First photo is the cover |

## favourites / idp_views / enquiries
| Table.Column | Type | Constraints | Description |
|---|---|---|---|
| favourites.favourite_id | SERIAL | PK | |
| favourites.customer_id | INTEGER | NN, FK user_accounts CASCADE | |
| favourites.idp_id | INTEGER | NN, FK idps CASCADE | |
| favourites.(customer_id, idp_id) | | U | No duplicates (story 39) |
| favourites.created_at | TIMESTAMPTZ | NN | "Shortlists" in analytics/reports |
| idp_views.view_id | BIGSERIAL | PK | |
| idp_views.idp_id | INTEGER | NN, FK idps CASCADE | |
| idp_views.viewer_id | INTEGER | FK user_accounts SET NULL | NULL = anonymous visitor |
| idp_views.viewed_at | TIMESTAMPTZ | NN | |
| enquiries.enquiry_id | SERIAL | PK | |
| enquiries.idp_id | INTEGER | NN, FK idps CASCADE | Page the enquiry came from |
| enquiries.customer_id | INTEGER | NN, FK user_accounts CASCADE | |
| enquiries.designer_id | INTEGER | NN, FK interior_designers CASCADE | Recipient |
| enquiries.message | VARCHAR(2000) | NN | 10-2000 characters (validated) |
| enquiries.contact_phone | VARCHAR(30) | | |
| enquiries.status | VARCHAR(10) | NN, CHECK new/read | |

## search_logs / reports
| Table.Column | Type | Constraints | Description |
|---|---|---|---|
| search_logs.search_id | BIGSERIAL | PK | |
| search_logs.account_id | INTEGER | FK user_accounts SET NULL | NULL = anonymous |
| search_logs.keyword | VARCHAR(200) | | |
| search_logs.filters | JSONB | NN | Active filters and sort |
| search_logs.result_count | INTEGER | NN | |
| search_logs.searched_at | TIMESTAMPTZ | NN | "Searches performed" |
| reports.report_id | SERIAL | PK | |
| reports.report_type | VARCHAR(10) | NN, CHECK daily/weekly/monthly/custom | |
| reports.title | VARCHAR(200) | NN | |
| reports.period_start, period_end | DATE | NN, end >= start | Inclusive |
| reports.generated_by | INTEGER | FK user_accounts SET NULL | |
| reports.data | JSONB | NN | Snapshot of all figures at generation time |
| reports.created_at | TIMESTAMPTZ | NN | |
