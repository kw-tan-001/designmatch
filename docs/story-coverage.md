# User story coverage matrix

Every one of the 60 user stories mapped to the BCE classes that implement it and the tests that verify it.
"UI boundary" is the screen in `public/js/views/*`, "API boundary" the Express route in `src/boundary/routes/*`,
"Control" the class in `src/control/*`, and "Entity" the class in `src/entity/*` with its table.

Test IDs: `UT-*` are Control-layer unit tests in `tests/unit/`, `IT-*` are API integration tests in `tests/integration/`.

Status key: **Implemented** = working end to end (UI, API, database) and covered by at least one automated test.

## A. User Admin (stories 1 to 16)

| # | Story | UI boundary | API boundary | Control class | Entity (table) | Tests | Status |
|---|---|---|---|---|---|---|---|
| 1 | View all registered accounts | AccountListPage `#/admin/accounts` | `GET /api/admin/accounts` | ViewUserAccountsController | UserAccount (user_accounts) | UT-ADM-01, IT-ADM-01 | Implemented |
| 2 | Suspend or reactivate an account | AccountListPage, AccountDetailsPage | `PATCH /api/admin/accounts/:id/status` | SuspendUserAccountController | UserAccount (user_accounts) | UT-ADM-02, UT-AUTH-04, IT-ADM-04 | Implemented |
| 3 | Approve designer registrations | RegistrationApprovalPage `#/admin/registrations` | `GET /api/admin/registrations`, `POST /api/admin/registrations/:id/approve` | ViewDesignerRegistrationsController, ApproveInteriorDesignerRegistrationController | InteriorDesigner (interior_designers) | UT-REG-01, UT-REG-03, IT-REG-01 | Implemented |
| 4 | Reset a user's password securely | AccountDetailsPage (Reset password) | `POST /api/admin/accounts/:id/reset-password` | ResetUserPasswordController | UserAccount (user_accounts) | UT-ADM-03, UT-SEC-02, IT-ADM-05 | Implemented |
| 5 | Log in | LoginForm `#/login` | `POST /api/auth/login` | LoginController | UserAccount, UserProfile | UT-AUTH-01..03, IT-AUTH-01, IT-AUTH-02 | Implemented |
| 6 | Log out | Header "Log out" | `POST /api/auth/logout` | LogoutController | (session store) | UT-AUTH-12, IT-AUTH-04 | Implemented |
| 7 | Create a user account | CreateAccountForm `#/admin/accounts/new` | `POST /api/admin/accounts` | CreateUserAccountController | UserAccount, InteriorDesigner, Company | UT-ADM-04, UT-ADM-05, IT-ADM-03 | Implemented |
| 8 | View account details | AccountDetailsPage `#/admin/accounts/:id` | `GET /api/admin/accounts/:id` | ViewUserAccountController | UserAccount, InteriorDesigner | UT-ADM-07, IT-ADM-03 | Implemented |
| 9 | Update a user account | EditAccountForm `#/admin/accounts/:id/edit` | `PUT /api/admin/accounts/:id` | UpdateUserAccountController | UserAccount (user_accounts) | UT-ADM-06, IT-ADM-03 | Implemented |
| 10 | Search user accounts | AccountListPage search bar + filters | `GET /api/admin/accounts?q=&role=&status=` | SearchUserAccountsController | UserAccount (user_accounts) | UT-ADM-01, IT-ADM-02 | Implemented |
| 11 | Reject a designer registration with a reason | RegistrationApprovalPage (Reject dialog) | `POST /api/admin/registrations/:id/reject` | RejectInteriorDesignerRegistrationController | InteriorDesigner (interior_designers) | UT-REG-02, UT-AUTH-06, IT-REG-02, IT-AUTH-03 | Implemented |
| 12 | Create a user profile with permissions | CreateProfileForm `#/admin/profiles/new` | `POST /api/admin/profiles`, `GET /api/admin/permissions` | CreateUserProfileController | UserProfile (user_profiles) | UT-PRF-01, UT-PRF-02, IT-PRF-01 | Implemented |
| 13 | View a profile and its permissions | ProfileDetailsPage `#/admin/profiles/:id` | `GET /api/admin/profiles/:id` | ViewUserProfileController | UserProfile (user_profiles) | UT-PRF-05, IT-PRF-01 | Implemented |
| 14 | Update a user profile | ProfileDetailsPage (Update form) | `PUT /api/admin/profiles/:id` | UpdateUserProfileController | UserProfile (user_profiles) | UT-PRF-03, IT-PRF-01, IT-PRF-03 | Implemented |
| 15 | Suspend a profile without deleting accounts | ProfileListPage, ProfileDetailsPage | `PATCH /api/admin/profiles/:id/status` | SuspendUserProfileController | UserProfile (user_profiles) | UT-PRF-04, UT-AUTH-05, IT-PRF-02 | Implemented |
| 16 | Search user profiles | ProfileListPage `#/admin/profiles` | `GET /api/admin/profiles?q=&role=` | SearchUserProfilesController | UserProfile (user_profiles) | UT-PRF-05, IT-PRF-01 | Implemented |

## B. Interior Designer (stories 17 to 34)

| # | Story | UI boundary | API boundary | Control class | Entity (table) | Tests | Status |
|---|---|---|---|---|---|---|---|
| 17 | Register with professional details | RegisterDesignerForm `#/register/designer` | `POST /api/auth/register/designer` | RegisterInteriorDesignerController | UserAccount, InteriorDesigner, Company | UT-AUTH-08, UT-AUTH-09, IT-AUTH-06 | Implemented |
| 18 | Log in and edit profile | LoginForm; EditPersonalProfileForm `#/account`; CompanyProfileForm (professional details) | `POST /api/auth/login`, `PUT /api/auth/me`, `PUT /api/designer/profile` | LoginController, EditPersonalProfileController, EditDesignerProfileController | UserAccount, InteriorDesigner | UT-AUTH-01, UT-AUTH-11, IT-AUTH-07, IT-DES-04 | Implemented |
| 19 | Create and edit company profile | CompanyProfileForm `#/studio/company` | `PUT /api/designer/company` (multipart logo) | CreateEditCompanyProfileController | Company (companies, company_service_areas) | UT-CO-01, IT-DES-01, IT-DES-02 | Implemented |
| 20 | Add certifications | CompanyProfileForm (Certifications panel) | `POST/DELETE /api/designer/company/certifications` | AddCertificationController | Certification (certifications) | UT-CO-02, IT-DES-03 | Implemented |
| 21 | Create an IDP listing | CreateIDPListingForm `#/studio/idp/new` | `POST /api/designer/idps` (multipart photos) | CreateIDPListingController | IDP, IDPPhoto (idps, idp_photos, idp_styles) | UT-IDP-01, UT-IDP-02, IT-IDP-01, IT-IDP-02 | Implemented |
| 22 | Mark IDP current or past | PortfolioPage status selector; IDP form | `PATCH /api/designer/idps/:id/status` | MarkIDPStatusController | IDP (idps) | UT-IDP-04, IT-IDP-03 | Implemented |
| 23 | Edit or delete an IDP | EditIDPListingForm `#/studio/idp/:id/edit`; PortfolioPage Delete | `PUT /api/designer/idps/:id`, `DELETE /api/designer/idps/:id` | UpdateIDPListingController, DeleteIDPListingController | IDP, IDPPhoto (cascade to favourites, idp_views, enquiries) | UT-IDP-03, UT-IDP-05, UT-IDP-06, IT-IDP-04, IT-IDP-06, IT-IDP-07 | Implemented |
| 24 | Organise IDPs into categories | PortfolioPage category selector; IDP form | `PATCH /api/designer/idps/:id/category` | CategoriseIDPController | IDP, IDPCategory | UT-IDP-04, IT-IDP-03 | Implemented |
| 25 | View view counts per IDP | IDPAnalyticsPage `#/studio/analytics`; PortfolioPage | `GET /api/designer/analytics/views` | ViewIDPViewCountsController | IDP, IDPView (idp_views) | UT-CO-03, IT-ANA-01 | Implemented |
| 26 | View shortlist counts per IDP | IDPAnalyticsPage; PortfolioPage | `GET /api/designer/analytics/shortlists` | ViewIDPShortlistCountsController | IDP, Favourite (favourites) | UT-CO-03, IT-ANA-01 | Implemented |
| 27 | Performance summary dashboard | DesignerDashboardPage `#/studio` | `GET /api/designer/dashboard` | ViewPerformanceDashboardController | IDP, IDPView, Favourite, Enquiry | UT-CO-03, IT-ANA-01 | Implemented |
| 28 | Log out | Header "Log out" | `POST /api/auth/logout` | LogoutController | (session store) | UT-AUTH-12, IT-AUTH-04 | Implemented |
| 29 | View company profile | CompanyProfileForm `#/studio/company` | `GET /api/designer/company` | ViewCompanyProfileController | Company, Certification | IT-DES-01 | Implemented |
| 30 | Preview company profile as a customer | CompanyPreviewPage `#/studio/preview` | `GET /api/designer/company/preview` | PreviewCompanyProfileController | Company, InteriorDesigner, Certification, IDP | UT-CO-05, IT-DES-05 | Implemented |
| 31 | View an IDP in own portfolio | OwnIDPPage `#/studio/idp/:id` | `GET /api/designer/idps/:id` | ViewOwnIDPController | IDP, IDPPhoto | UT-IDP-03, IT-IDP-05 | Implemented |
| 32 | Search own IDPs | PortfolioPage `#/studio/portfolio` | `GET /api/designer/idps?q=&status=&categoryId=` | SearchOwnIDPsController | IDP (idps) | UT-IDP-08, IT-IDP-05 | Implemented |
| 33 | Tag IDP with style and property type | OwnIDPPage (Tags panel); IDP form | `PUT /api/designer/idps/:id/tags` | TagIDPController | IDP, DesignStyle, PropertyType (idp_styles) | UT-IDP-07, IT-IDP-01, IT-IDP-03 | Implemented |
| 34 | View customer enquiries | EnquiriesPage `#/studio/enquiries` | `GET /api/designer/enquiries`, `PATCH /api/designer/enquiries/:id/read` | ViewEnquiriesController | Enquiry (enquiries) | UT-CO-04, IT-ANA-02 | Implemented |

## C. Customer (stories 35 to 48)

| # | Story | UI boundary | API boundary | Control class | Entity (table) | Tests | Status |
|---|---|---|---|---|---|---|---|
| 35 | Register a free account | RegisterCustomerForm `#/register` | `POST /api/auth/register/customer` | RegisterCustomerController | UserAccount, UserProfile | UT-AUTH-07, IT-AUTH-05 | Implemented |
| 36 | Log in and edit personal profile | LoginForm; EditPersonalProfileForm `#/account` | `POST /api/auth/login`, `PUT /api/auth/me`, `PUT /api/auth/me/password` | LoginController, EditPersonalProfileController, ChangePasswordController | UserAccount | UT-AUTH-01, UT-AUTH-10, UT-AUTH-11, IT-AUTH-07 | Implemented |
| 37 | Search by category, budget, location | SearchIDPsPage `#/discover` filters; HomePage search | `GET /api/idps?categoryId=&budgetMin=&budgetMax=&location=` | SearchIDPsController | IDP, SearchLog (search_logs) | UT-CUS-01, UT-CUS-02, IT-SRCH-02, IT-SRCH-06 | Implemented |
| 38 | View full IDP details | IDPDetailsPage `#/idp/:id` | `GET /api/idps/:id` | ViewIDPDetailsController | IDP, IDPPhoto, IDPView | UT-CUS-03, IT-CUS-01 | Implemented |
| 39 | Save an IDP to favourites | Heart buttons; IDPDetailsPage "Save" | `POST /api/customer/favourites` | SaveFavouriteController | Favourite (favourites, UNIQUE customer+idp) | UT-CUS-05, IT-CUS-03 | Implemented |
| 40 | View and manage favourites (persists) | ManageFavouritesForm `#/favourites` | `GET /api/customer/favourites`, `DELETE /api/customer/favourites/:idpId` | ManageFavouritesListController | Favourite (favourites) | UT-CUS-06, IT-CUS-04 | Implemented |
| 41 | Contact a designer from an IDP page | IDPDetailsPage enquiry form; SentEnquiriesPage `#/enquiries` | `POST /api/customer/enquiries`, `GET /api/customer/enquiries` | ContactDesignerController | Enquiry (enquiries) | UT-CUS-07, IT-CUS-06 | Implemented |
| 42 | Log out | Header "Log out" | `POST /api/auth/logout` | LogoutController | (session store) | UT-AUTH-12, IT-AUTH-04 | Implemented |
| 43 | Search by keyword | SearchIDPsPage keyword field | `GET /api/idps?keyword=` | SearchIDPsController | IDP, SearchLog | UT-CUS-01, IT-SRCH-03 | Implemented |
| 44 | Filter by style and property type | SearchIDPsPage style checkboxes, property select | `GET /api/idps?styleIds=&propertyTypeId=` | SearchIDPsController | IDP, DesignStyle, PropertyType | UT-CUS-01, IT-SRCH-04 | Implemented |
| 45 | Sort search results | SearchIDPsPage "Sort by" | `GET /api/idps?sort=newest\|most_viewed\|most_favourited\|budget_low\|budget_high\|oldest` | SearchIDPsController | IDP, IDPView, Favourite | UT-CUS-02, IT-SRCH-05 | Implemented |
| 46 | View a designer's company profile | DesignerProfilePage `#/designer/:id` | `GET /api/designers/:id` | ViewDesignerCompanyProfileController | Company, InteriorDesigner, Certification | UT-CUS-04, IT-CUS-02 | Implemented |
| 47 | Browse all IDPs by a designer | DesignerProfilePage project list (paged, sortable) | `GET /api/designers/:id/idps` | BrowseDesignerIDPsController | IDP (idps) | UT-CUS-04, IT-CUS-02 | Implemented |
| 48 | Search within favourites | ManageFavouritesForm search bar | `GET /api/customer/favourites?q=` | SearchFavouritesController | Favourite (favourites) | UT-CUS-06, IT-CUS-05 | Implemented |

## D. Platform Management (stories 49 to 60)

| # | Story | UI boundary | API boundary | Control class | Entity (table) | Tests | Status |
|---|---|---|---|---|---|---|---|
| 49 | Membership statistics by role | MembershipStatisticsPage `#/manage` | `GET /api/manager/stats` | ViewMembershipStatisticsController | PlatformStatistics (aggregates) | UT-MGT-06, IT-MGT-01 | Implemented |
| 50 | Create, edit, delete categories | ManageCategoriesPage `#/manage/categories` | `POST/PUT/DELETE /api/manager/categories[/:id]` | CreateIDPCategoryController, UpdateIDPCategoryController, DeleteIDPCategoryController | IDPCategory (idp_categories) | UT-MGT-01, IT-CAT-02, IT-CAT-03, IT-CAT-04 | Implemented |
| 51 | Daily report | GenerateReportForm `#/manage/reports` | `POST /api/manager/reports/daily` | GenerateDailyReportController | PlatformStatistics, Report (reports) | UT-MGT-02, UT-MGT-05, IT-RPT-01 | Implemented |
| 52 | Weekly report with growth trends | GenerateReportForm | `POST /api/manager/reports/weekly` | GenerateWeeklyReportController | PlatformStatistics, Report | UT-MGT-03, UT-RPT-01, IT-RPT-02 | Implemented |
| 53 | Monthly report: top designers and categories | GenerateReportForm | `POST /api/manager/reports/monthly` | GenerateMonthlyReportController | PlatformStatistics, Report | UT-MGT-04, IT-RPT-03 | Implemented |
| 54 | Log in | LoginForm | `POST /api/auth/login` | LoginController | UserAccount, UserProfile | IT-AUTH-01 | Implemented |
| 55 | Log out | Header "Log out" | `POST /api/auth/logout` | LogoutController | (session store) | UT-AUTH-12, IT-AUTH-04 | Implemented |
| 56 | View all categories | ManageCategoriesPage | `GET /api/manager/categories` | ViewIDPCategoriesController | IDPCategory | UT-MGT-01, IT-CAT-01 | Implemented |
| 57 | Search categories | ManageCategoriesPage search bar | `GET /api/manager/categories?q=` | SearchIDPCategoriesController | IDPCategory | UT-MGT-01, IT-CAT-01 | Implemented |
| 58 | Custom date-range report | GenerateReportForm (Custom) | `POST /api/manager/reports/custom` | GenerateCustomReportController | PlatformStatistics, Report | UT-MGT-05, IT-RPT-04 | Implemented |
| 59 | View previously generated reports | ReportHistoryPage `#/manage/reports`; ReportViewPage `#/manage/reports/:id` | `GET /api/manager/reports`, `GET /api/manager/reports/:id` | ViewReportsController | Report (reports) | UT-MGT-06, IT-RPT-05 | Implemented |
| 60 | Export a report as PDF or CSV | ReportViewPage / history "CSV" and "PDF" buttons | `GET /api/manager/reports/:id/export?format=csv\|pdf` | ExportReportController (+ ReportExporter service) | Report | UT-RPT-02..04, UT-MGT-06, IT-RPT-06 | Implemented |

## Shared log-in / log-out stories

Stories 5, 18, 36 and 54 (log in) share `LoginController`, and stories 6, 28, 42 and 55 (log out) share
`LogoutController`. The use case is identical for every actor; role-specific behaviour (redirect to the
right dashboard, designer approval checks) is handled inside the controller and the UI boundary.
