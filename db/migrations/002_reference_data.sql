-- =====================================================================
-- Migration 002: controlled reference data (profiles + lookup values)
-- The permission codes must match src/entity/UserProfile.js PERMISSIONS.
-- =====================================================================

BEGIN;

INSERT INTO user_profiles (name, role, description, permissions) VALUES
  ('User Admin', 'admin',
   'Manages user accounts, user profiles and interior designer registrations.',
   ARRAY['accounts.view', 'accounts.manage', 'registrations.review', 'profiles.manage']),
  ('Interior Designer', 'designer',
   'Manages company information, portfolio of IDPs and customer enquiries.',
   ARRAY['company.manage', 'idp.manage', 'analytics.view', 'enquiries.view']),
  ('Customer', 'customer',
   'Searches, views and saves IDPs, and contacts interior designers.',
   ARRAY['favourites.manage', 'enquiries.send']),
  ('Platform Manager', 'manager',
   'Manages IDP categories, membership statistics and platform reports.',
   ARRAY['stats.view', 'categories.manage', 'reports.generate'])
ON CONFLICT (name) DO NOTHING;

INSERT INTO idp_categories (name, description) VALUES
  ('Kitchen',      'Kitchen renovations, cabinetry and islands.'),
  ('Living Room',  'Living and family spaces, feature walls and lighting.'),
  ('Bedroom',      'Master and secondary bedrooms, wardrobes and storage.'),
  ('Bathroom',     'Bathrooms, powder rooms and wet areas.'),
  ('Whole-Home',   'Complete home renovations across every room.'),
  ('Study & Home Office', 'Work-from-home spaces and libraries.'),
  ('Dining Room',  'Dining spaces, banquettes and pantries.'),
  ('Commercial',   'Offices, retail and hospitality interiors.')
ON CONFLICT DO NOTHING;

INSERT INTO design_styles (name) VALUES
  ('Modern'), ('Minimalist'), ('Scandinavian'), ('Japandi'), ('Industrial'),
  ('Contemporary'), ('Mid-Century Modern'), ('Luxury'), ('Rustic'), ('Peranakan')
ON CONFLICT DO NOTHING;

INSERT INTO property_types (name) VALUES
  ('HDB'), ('Condominium'), ('Landed'), ('Executive Condominium'), ('Commercial')
ON CONFLICT DO NOTHING;

COMMIT;
