'use strict';

/**
 * DesignMatch test-data generator (Faker).
 *
 *   npm run seed            -> resets the schema, then inserts synthetic data
 *
 * - Repeatable: the schema is rebuilt and Faker is seeded with a fixed value,
 *   so every run produces the same dataset.
 * - Synthetic only: names come from Faker and all emails use example.com.
 * - Referential integrity: every foreign key points at a row created earlier.
 * - Reports are produced through the real report Control classes, so their
 *   figures are calculated from the generated records.
 */
const { faker } = require('@faker-js/faker');
const db = require('../src/config/db');
const { migrate } = require('../db/migrate');
const PasswordService = require('../src/services/PasswordService');
const config = require('../src/config/env');
const dates = require('../src/utils/dates');
const Rep = require('../src/control/manager/ReportControllers');

faker.seed(314);

const COUNTS = {
  customers: 100,
  designers: 100, // 80 approved, 14 pending, 6 rejected (plus the two demo designers)
  idps: 160, // the hand-written PROJECTS below plus generated ones up to this total
  views: 3000,
  favourites: 450,
  enquiries: 160,
  searches: 450,
};
const DAYS_OF_HISTORY = 180;

const DEMO = {
  admin: { email: 'admin@designmatch.sg', password: 'Admin123!', name: 'Alicia Tan' },
  designer: { email: 'designer@designmatch.sg', password: 'Designer123!', name: 'Marcus Lim' },
  customer: { email: 'customer@designmatch.sg', password: 'Customer123!', name: 'Priya Nair' },
  manager: { email: 'manager@designmatch.sg', password: 'Manager123!', name: 'Daniel Wong' },
  pending: { email: 'pending.designer@designmatch.sg', password: 'Designer123!', name: 'Grace Ho' },
};
const GENERATED_PASSWORD = 'Password123';

const LOCATIONS = ['Tampines', 'Bedok', 'Punggol', 'Sengkang', 'Woodlands', 'Jurong East', 'Bukit Timah', 'Toa Payoh',
  'Ang Mo Kio', 'Bishan', 'Clementi', 'Queenstown', 'Pasir Ris', 'Yishun', 'Serangoon', 'Holland Village',
  'Novena', 'Marine Parade', 'Bukit Panjang', 'Tiong Bahru'];
const REGIONS = ['Central', 'East', 'North', 'North-East', 'West'];
const COMPANY_A = ['Atelier', 'Studio', 'Maison', 'House of', 'The', 'Casa', 'Nook', 'Form', 'Linen', 'Oak'];
const COMPANY_B = ['Haven', 'Lumen', 'Terra', 'Kinfolk', 'Meridian', 'Arbor', 'Stillwater', 'Hearth', 'Quarry', 'Sable',
  'Juniper', 'Cove', 'Ember', 'Slate', 'Willow'];
const COMPANY_C = ['Interiors', 'Design Co.', 'Spaces', 'Living', 'Design Studio', 'Interior Architecture'];
const SPECIALISATIONS = ['HDB renovations', 'Condominium interiors', 'Landed homes', 'Small-space living', 'Kitchen design',
  'Sustainable interiors', 'Luxury residences', 'Commercial fit-outs'];
const CERTS = [
  ['Certified Interior Designer', 'Society of Interior Designers Singapore'],
  ['CaseTrust Accreditation', 'Consumers Association of Singapore'],
  ['HDB Registered Renovation Contractor', 'Housing & Development Board'],
  ['RenoTrust Membership', 'Singapore Renovation Contractors & Material Suppliers Association'],
  ['BCA Green Mark Associate', 'Building and Construction Authority'],
  ['Diploma in Interior Design', 'Nanyang Academy of Fine Arts'],
  ['Bachelor of Arts (Interior Design)', 'LASALLE College of the Arts'],
];
const TITLE_SPACES = {
  Kitchen: ['Kitchen Refresh', 'Open Kitchen', 'Galley Kitchen', 'Kitchen & Island'],
  'Living Room': ['Living Room Makeover', 'Family Lounge', 'Light-filled Living Room'],
  Bedroom: ['Master Bedroom Retreat', 'Calm Bedroom Suite', "Children's Bedroom"],
  Bathroom: ['Spa Bathroom', 'Compact Bathroom', 'Ensuite Renovation'],
  'Whole-Home': ['Whole-Home Renovation', 'Family Home Transformation', 'Full Apartment Overhaul'],
  'Study & Home Office': ['Home Office', 'Study & Library', 'Work-from-Home Nook'],
  'Dining Room': ['Dining Room', 'Dining & Pantry', 'Banquette Dining Corner'],
  Commercial: ['Boutique Office', 'Cafe Interior', 'Retail Showroom'],
};
const FEATURES = ['custom carpentry with hidden storage', 'warm oak veneer finishes', 'a quartz-topped island', 'concealed LED cove lighting',
  'terrazzo flooring', 'fluted glass partitions', 'a feature wall in limewash plaster', 'full-height wardrobes', 'a reading nook by the window',
  'matte black fixtures', 'a walk-in shower with frameless glass', 'built-in bench seating', 'rattan and cane accents', 'micro-cement surfaces'];
const GOALS = ['maximise natural light', 'create more storage for a growing family', 'open up a compact layout', 'bring a calm, hotel-like feel',
  'make the space easier to clean and maintain', 'blend work and living areas', 'reflect the owners\' love of travel'];
const ENQUIRY_LINES = [
  'Hi, I love this project. We have a similar unit and would like a quotation for a full renovation.',
  'Could you share the approximate timeline for a project like this? We collect our keys next month.',
  'We are interested in a similar look for our kitchen. Are you available for a site visit next week?',
  'What is included in the budget range shown here? Does it cover carpentry and electrical works?',
  'Hello! We are renovating a resale flat and really like your use of storage. Can we arrange a consultation?',
  'Do you take on smaller projects such as a single bedroom and study? Thanks!',
];
const SEARCH_TERMS = ['scandinavian', 'japandi kitchen', 'hdb', 'condo living room', 'minimalist', 'storage', 'bto', 'industrial',
  'luxury', 'bathroom', 'study room', 'whole home', 'landed', 'peranakan', 'small kitchen', 'walk-in wardrobe', 'island', 'oak'];

// ---- Projects -------------------------------------------------------------
// Every project is written out by hand so each one is different: its own title, room, styles and
// photos. Photos live in public/img/rooms/ and none is used by two projects. The first photo is the
// cover. To add a project, add an entry here and put its photos in that folder, then run db:reset.
// `studio` 0 is the demo designer's studio (Studio Haven Interiors); 1-9 are the generated studios.
const PROJECTS = [
  { title: 'Mountain Mural Living Room in Punggol', category: 'Living Room', type: 'HDB', styles: ['Japandi', 'Contemporary'], studio: 0,
    budget: [38000, 55000], status: 'past', detail: 'a hand-painted tree and mountain mural with concealed cove lighting',
    photos: [['hero-mural', 'Hand-painted mural wall with a low timber sofa'], ['foyer-elephant', 'Backlit oval feature panel at the entrance']] },
  { title: 'Forest Green Luxury Lounge in Bukit Timah', category: 'Living Room', type: 'Landed', styles: ['Luxury', 'Modern'], studio: 1,
    budget: [90000, 140000], status: 'past', detail: 'a sculpted forest-green feature wall with a lit circular inset',
    photos: [['living-green', 'Cream and forest-green lounge with a glowing circular inset']] },
  { title: 'Sunlit Garden Living Room in Sengkang', category: 'Living Room', type: 'Executive Condominium', styles: ['Scandinavian', 'Minimalist'], studio: 2,
    budget: [30000, 45000], status: 'current', detail: 'a painted forest mural and planting that brings the garden indoors',
    photos: [['living-sunlit', 'Low sofa against a painted green mural in afternoon light']] },
  { title: 'Olive & Oak Family Lounge in Bishan', category: 'Living Room', type: 'Condominium', styles: ['Contemporary', 'Scandinavian'], studio: 3,
    budget: [45000, 70000], status: 'past', detail: 'olive-green media joinery and a fluted walnut display niche',
    photos: [['living-olive', 'Olive media wall with a fluted walnut display niche']] },
  { title: 'Palm Wall Reading Corner in Holland Village', category: 'Living Room', type: 'Condominium', styles: ['Luxury', 'Mid-Century Modern'], studio: 4,
    budget: [25000, 40000], status: 'current', detail: 'a sculpted palm-leaf relief wall with gilded accents',
    photos: [['reading-palm', 'Velvet armchair against a sculpted palm-leaf wall']] },
  { title: 'Gold Leaf Mural Bedroom in Novena', category: 'Bedroom', type: 'Condominium', styles: ['Luxury', 'Modern'], studio: 5,
    budget: [35000, 60000], status: 'past', detail: 'a deep green mural with hand-drawn gold leaf lines',
    photos: [['bedroom-gold', 'Upholstered bed against a gold-line leaf mural']] },
  { title: 'Sage Master Bedroom Suite in Woodlands', category: 'Bedroom', type: 'HDB', styles: ['Contemporary', 'Japandi'], studio: 6,
    budget: [28000, 42000], status: 'current', detail: 'a backlit sage headboard wall, fluted timber panels and an arched mirror',
    photos: [['bedroom-sage', 'Sage headboard wall with cove lighting and an arched mirror']] },
  { title: 'Industrial Spa Bathroom in Bedok', category: 'Bathroom', type: 'Landed', styles: ['Industrial', 'Luxury'], studio: 0,
    budget: [40000, 65000], status: 'current', detail: 'micro-cement walls, exposed brick and a freestanding black stone tub',
    photos: [['bathroom-industrial', 'Concrete and brick bathroom with a black stone tub'], ['bathroom-concrete', 'Guest shower room with a timber vanity and steel-framed screen']] },
  { title: 'Sage Vanity Bathroom in Toa Payoh', category: 'Bathroom', type: 'HDB', styles: ['Scandinavian', 'Contemporary'], studio: 7,
    budget: [15000, 24000], status: 'past', detail: 'a floating sage vanity and a backlit oval mirror',
    photos: [['bathroom-sage', 'Floating sage vanity under a backlit oval mirror']] },
  { title: 'Green Tile Compact Kitchen in Clementi', category: 'Kitchen', type: 'HDB', styles: ['Modern', 'Minimalist'], studio: 8,
    budget: [22000, 34000], status: 'past', detail: 'vertical green tiles, oak base units and a lit open shelf',
    photos: [['kitchen-green', 'Oak and white kitchen with a green tile splashback']] },
  { title: 'Scandinavian Dining & Pantry in Tampines', category: 'Dining Room', type: 'HDB', styles: ['Scandinavian', 'Japandi'], studio: 9,
    budget: [26000, 40000], status: 'past', detail: 'an oak pantry wall with arched glass cabinets and a pegboard backsplash',
    photos: [['kitchen-pantry', 'Oak pantry wall with arched glass cabinets']] },
  { title: 'Sage Dining Room with Arched Niche in Serangoon', category: 'Dining Room', type: 'Condominium', styles: ['Japandi', 'Contemporary'], studio: 1,
    budget: [32000, 48000], status: 'current', detail: 'a lit arched display niche and a fluted walnut sideboard',
    photos: [['dining-sage', 'Walnut dining table beside a lit arched niche']] },
  { title: 'Sage Home Office in Ang Mo Kio', category: 'Study & Home Office', type: 'HDB', styles: ['Scandinavian', 'Modern'], studio: 2,
    budget: [12000, 20000], status: 'past', detail: 'floating oak shelves, a pin board and a window-side desk',
    photos: [['study-sage', 'Oak desk and floating shelves against a sage wall']] },
  { title: 'Forest Green Study in Marine Parade', category: 'Study & Home Office', type: 'Condominium', styles: ['Mid-Century Modern', 'Modern'], studio: 3,
    budget: [18000, 30000], status: 'current', detail: 'a curved two-tone paint line and full-height green shelving',
    photos: [['study-green', 'Walnut desk under a curved green paint line']] },
  { title: 'Industrial Retail Showroom in Queenstown', category: 'Commercial', type: 'Commercial', styles: ['Industrial', 'Modern'], studio: 4,
    budget: [60000, 120000], status: 'current', detail: 'a lit crescent feature wall and fluted panelling',
    photos: [['showroom-queenstown', 'Lounge display with a lit crescent feature wall']] },
  { title: 'Japandi Tatami Tea House in Tiong Bahru', category: 'Commercial', type: 'Commercial', styles: ['Japandi', 'Minimalist'], studio: 0,
    budget: [110000, 180000], status: 'past', detail: 'tatami seating, shoji screens, paper lanterns and an indoor bonsai garden',
    photos: [['japan-tatami', 'Tatami tea room with shoji screens, paper lanterns and a bonsai garden']] },
  { title: 'Warm Neutral Condo Overhaul in Jurong East', category: 'Whole-Home', type: 'Condominium', styles: ['Contemporary', 'Modern'], studio: 0,
    budget: [120000, 180000], status: 'past', detail: 'consistent cove lighting, oak accents and marble-look floors in every room',
    photos: [['wh-condo-1', 'Living room with an L-shaped sofa and media wall'], ['wh-condo-2', 'Master bedroom with a glass-front wardrobe'],
      ['wh-condo-3', 'Kitchen with lit open shelving'], ['wh-condo-4', 'Dining area with glass pendant lights'], ['wh-condo-5', 'Second media wall with timber display shelves']] },
  { title: 'Serene Studio Apartment in Bukit Panjang', category: 'Whole-Home', type: 'Executive Condominium', styles: ['Minimalist', 'Japandi'], studio: 5,
    budget: [70000, 100000], status: 'current', detail: 'pale oak panelling throughout and lighting hidden in every ceiling edge',
    photos: [['wh-studio-1', 'Living area with a low media console'], ['wh-studio-2', 'Entrance with a full-height mirror'],
      ['wh-studio-3', 'Bedroom with panelled walls'], ['wh-studio-4', 'Kitchen and breakfast table'], ['wh-studio-5', 'Kitchen with a mirrored wardrobe wall'],
      ['wh-studio-6', 'Bathroom with a freestanding tub and round mirror']] },
  { title: 'Landed Home with Pool Terrace in Pasir Ris', category: 'Whole-Home', type: 'Landed', styles: ['Modern', 'Luxury'], studio: 6,
    budget: [250000, 380000], status: 'past', detail: 'an open-plan ground floor that opens onto a pool terrace',
    photos: [['wh-landed-1', 'Open-plan living, dining and kitchen facing the pool'], ['wh-landed-2', 'Master bedroom opening onto the pool deck'],
      ['wh-landed-3', 'Ensuite bathroom and study corner'], ['wh-landed-4', 'Guest bedroom with a work desk'], ['wh-landed-5', 'Outdoor dining terrace with a fireplace']] },
];
const roomUrl = (name) => `/img/rooms/${name}.jpg`;

// ---- Generated projects -----------------------------------------------------
// The rest of the 160 projects are generated from these templates, so they need no hand-written
// entry. Each takes its photos from its room's pool below; covers rotate through the pool so
// projects listed next to each other look different.
const POOLS = {
  'Living Room': ['hero-mural', 'living-green', 'living-sunlit', 'living-olive', 'reading-palm', 'foyer-elephant', 'wh-condo-1', 'wh-studio-1', 'wh-condo-5', 'wh-landed-1'],
  Bedroom: ['bedroom-gold', 'bedroom-sage', 'wh-condo-2', 'wh-studio-3', 'wh-landed-2', 'wh-landed-4'],
  Bathroom: ['bathroom-industrial', 'bathroom-sage', 'bathroom-concrete', 'wh-studio-6', 'wh-landed-3'],
  Kitchen: ['kitchen-green', 'kitchen-pantry', 'wh-condo-3', 'wh-studio-4', 'wh-studio-5'],
  'Dining Room': ['dining-sage', 'wh-condo-4', 'wh-landed-5', 'kitchen-pantry', 'wh-studio-4'],
  'Study & Home Office': ['study-sage', 'study-green', 'wh-landed-4', 'reading-palm'],
  Commercial: ['japan-tatami', 'showroom-queenstown', 'office-1', 'office-2'],
  'Whole-Home': ['wh-condo-1', 'wh-studio-1', 'wh-landed-1', 'wh-condo-2', 'wh-studio-4', 'wh-landed-2', 'wh-condo-3', 'wh-studio-6', 'wh-landed-5'],
};
const CAPTIONS = Object.fromEntries(PROJECTS.flatMap((pr) => pr.photos));
Object.assign(CAPTIONS, { 'office-1': 'Meeting room with a timber slat wall', 'office-2': 'Open workspace with built-in storage' });
const ROOM_WORDS = {
  'Living Room': ['Living Room', 'Family Lounge', 'Living Area', 'Lounge'], Bedroom: ['Bedroom', 'Master Bedroom', 'Guest Bedroom', 'Bedroom Suite'],
  Bathroom: ['Bathroom', 'Ensuite', 'Shower Room', 'Powder Room'], Kitchen: ['Kitchen', 'Galley Kitchen', 'Open Kitchen', 'Kitchen Refresh'],
  'Dining Room': ['Dining Room', 'Dining Nook', 'Dining & Pantry', 'Breakfast Corner'], 'Study & Home Office': ['Study', 'Home Office', 'Reading Room', 'Work Corner'],
  Commercial: ['Cafe', 'Retail Showroom', 'Office', 'Clinic Reception', 'Boutique'], 'Whole-Home': ['Whole-Home Makeover', 'Home Renovation', 'Apartment Overhaul', 'Family Home'],
};
const BUDGET_BANDS = {
  'Living Room': [20000, 90000], Bedroom: [15000, 60000], Bathroom: [10000, 50000], Kitchen: [18000, 85000],
  'Dining Room': [15000, 60000], 'Study & Home Office': [8000, 40000], Commercial: [60000, 260000], 'Whole-Home': [70000, 380000],
};
const DETAILS = {
  'Living Room': ['a fluted timber media wall', 'concealed cove lighting', 'a painted feature wall', 'built-in display shelving'],
  Bedroom: ['a backlit upholstered headboard wall', 'full-height wardrobes', 'a dressing nook with an arched mirror', 'layered warm lighting'],
  Bathroom: ['a floating vanity', 'a frameless walk-in shower', 'micro-cement walls', 'a backlit mirror'],
  Kitchen: ['handle-less oak cabinets', 'a tiled splashback with an open shelf', 'a breakfast counter', 'hidden appliance storage'],
  'Dining Room': ['a lit display niche', 'a fluted sideboard', 'a statement pendant light', 'a built-in banquette'],
  'Study & Home Office': ['floating shelves', 'a window-side desk', 'full-height bookshelves', 'acoustic panelling'],
  Commercial: ['a branded feature wall', 'flexible display fixtures', 'warm task lighting', 'durable commercial-grade finishes'],
  'Whole-Home': ['one material palette carried through every room', 'cove lighting in every ceiling', 'reworked storage throughout', 'an opened-up living and dining area'],
};

/** Builds the generated projects (same shape as PROJECTS) up to `total`, all with unique titles. */
function generateProjects(total, styleNames, propertyNames) {
  const used = new Set(PROJECTS.map((p) => p.title));
  const turn = {};
  const out = [];
  const weights = [['Living Room', 5], ['Kitchen', 4], ['Bedroom', 4], ['Bathroom', 3], ['Dining Room', 2], ['Study & Home Office', 2], ['Commercial', 2], ['Whole-Home', 3]];
  const weighted = weights.flatMap(([name, w]) => Array(w).fill(name));
  while (PROJECTS.length + out.length < total) {
    const category = faker.helpers.arrayElement(weighted);
    const styles = faker.helpers.arrayElements(styleNames, { min: 1, max: 2 });
    const location = faker.helpers.arrayElement(LOCATIONS);
    const title = `${styles[0]} ${faker.helpers.arrayElement(ROOM_WORDS[category])} in ${location}`;
    if (used.has(title)) continue;
    used.add(title);
    const pool = POOLS[category];
    turn[category] = (turn[category] || 0) + 1;
    const cover = pool[(turn[category] - 1) % pool.length];
    const extra = faker.helpers.arrayElements(pool.filter((n) => n !== cover), category === 'Whole-Home' ? { min: 3, max: 4 } : { min: 0, max: 2 });
    const [lo, hi] = BUDGET_BANDS[category];
    const min = Math.round(faker.number.int({ min: lo, max: (lo + hi) / 2 }) / 1000) * 1000;
    const max = Math.min(hi, Math.round((min * faker.number.int({ min: 130, max: 180 })) / 100000) * 1000);
    out.push({
      title, category, styles, studio: null, location,
      type: category === 'Commercial' ? 'Commercial' : faker.helpers.arrayElement(propertyNames.filter((n) => n !== 'Commercial')),
      budget: [min, max], status: faker.datatype.boolean({ probability: 0.35 }) ? 'current' : 'past',
      detail: faker.helpers.arrayElement(DETAILS[category]),
      photos: [cover, ...extra].map((n) => [n, CAPTIONS[n] || 'Project photo']),
    });
  }
  return out;
}

const randomDate = (from, to = new Date()) => faker.date.between({ from, to });
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const sgPhone = () => `+65 ${faker.helpers.arrayElement(['8', '9'])}${faker.number.int({ min: 100, max: 999 })} ${faker.number.int({ min: 1000, max: 9999 })}`;

/** Multi-row INSERT in chunks; returns the RETURNING rows. */
async function insertMany(table, columns, rows, returning = null) {
  const out = [];
  const chunk = Math.floor(60000 / columns.length / 1.2) || 1;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params = [];
    const values = part.map((r) => `(${r.map((v) => { params.push(v); return `$${params.length}`; }).join(', ')})`);
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values.join(', ')}${returning ? ` RETURNING ${returning}` : ''}`;
    // eslint-disable-next-line no-await-in-loop
    const res = await db.query(sql, params);
    out.push(...res.rows);
  }
  return out;
}

async function main() {
  console.log('Resetting schema...');
  await migrate({ reset: true, quiet: true });

  const profiles = Object.fromEntries((await db.query('SELECT profile_id, role FROM user_profiles ORDER BY profile_id')).rows
    .map((p) => [p.role, p.profile_id]));
  const [extraProfile] = await insertMany('user_profiles', ['name', 'role', 'description', 'permissions', 'is_suspended'], [
    ['Support Admin (read-only)', 'admin', 'Can view accounts but cannot change them.', ['accounts.view'], false],
    ['Trial Designer', 'designer', 'Legacy trial programme - suspended.', ['company.manage', 'idp.manage'], true],
  ], 'profile_id');
  void extraProfile;

  const categories = (await db.query('SELECT category_id, name FROM idp_categories')).rows;
  const propertyTypes = (await db.query('SELECT property_type_id, name FROM property_types')).rows;
  const styleNames = Object.fromEntries((await db.query('SELECT style_id, name FROM design_styles')).rows.map((r) => [r.style_id, r.name]));

  console.log('Hashing passwords...');
  const genHash = await PasswordService.hash(GENERATED_PASSWORD);
  const demoHash = {};
  for (const [k, d] of Object.entries(DEMO)) demoHash[k] = await PasswordService.hash(d.password); // eslint-disable-line no-await-in-loop

  // ---- Accounts ------------------------------------------------------------
  const usedEmails = new Set(Object.values(DEMO).map((d) => d.email));
  const person = (domainTag) => {
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    let email;
    let n = 0;
    do {
      email = `${first}.${last}${n ? n : ''}.${domainTag}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, '');
      n += 1;
    } while (usedEmails.has(email));
    usedEmails.add(email);
    return { name: `${first} ${last}`, email };
  };
  const accountCols = ['profile_id', 'email', 'password_hash', 'full_name', 'phone', 'location', 'status', 'created_at', 'last_login_at'];
  const accountRows = [];
  const roleOf = [];
  const demoRow = (key, role, created) => {
    accountRows.push([profiles[role], DEMO[key].email, demoHash[key], DEMO[key].name, sgPhone(), 'Bedok', 'active', created, null]);
    roleOf.push(`demo_${key}`);
  };
  demoRow('admin', 'admin', daysAgo(DAYS_OF_HISTORY + 10));
  demoRow('manager', 'manager', daysAgo(DAYS_OF_HISTORY + 10));
  demoRow('designer', 'designer', daysAgo(DAYS_OF_HISTORY));
  demoRow('customer', 'customer', daysAgo(120));
  demoRow('pending', 'designer', daysAgo(2));
  const addGenerated = (role, count, tag) => {
    for (let i = 0; i < count; i += 1) {
      const p = person(tag);
      const status = faker.number.int({ min: 1, max: 100 }) <= 4 ? 'suspended' : 'active';
      const created = randomDate(daysAgo(DAYS_OF_HISTORY));
      accountRows.push([profiles[role], p.email, genHash, p.name, sgPhone(), faker.helpers.arrayElement(LOCATIONS),
        role === 'designer' ? 'active' : status, created, faker.datatype.boolean() ? randomDate(created) : null]);
      roleOf.push(role);
    }
  };
  addGenerated('admin', 2, 'admin');
  addGenerated('manager', 1, 'mgmt');
  addGenerated('designer', COUNTS.designers, 'design');
  addGenerated('customer', COUNTS.customers, 'cust');
  const accounts = await insertMany('user_accounts', accountCols, accountRows, 'account_id, created_at');
  accounts.forEach((a, i) => { a.role = roleOf[i]; });
  const byKey = (k) => accounts.find((a) => a.role === `demo_${k}`);
  const adminId = byKey('admin').account_id;
  const managerAccount = byKey('manager');
  const customers = accounts.filter((a) => a.role === 'customer');
  const demoCustomer = byKey('customer');
  customers.unshift(demoCustomer);

  // ---- Designers + companies ---------------------------------------------
  const generatedDesigners = accounts.filter((a) => a.role === 'designer');
  const designerRows = [];
  const designerMeta = [];
  const pushDesigner = (acc, status, reason = null) => {
    designerRows.push([acc.account_id, status, reason, status === 'pending' ? null : adminId,
      status === 'pending' ? null : randomDate(new Date(acc.created_at)),
      `ID-${faker.number.int({ min: 10000, max: 99999 })}`, faker.number.int({ min: 1, max: 25 }),
      faker.helpers.arrayElement(SPECIALISATIONS),
      `We are a Singapore-based team focused on ${faker.helpers.arrayElement(SPECIALISATIONS).toLowerCase()}. We work closely with homeowners to ${faker.helpers.arrayElement(GOALS)}.`]);
    designerMeta.push({ id: acc.account_id, status, created: acc.created_at });
  };
  pushDesigner(byKey('designer'), 'approved');
  pushDesigner(byKey('pending'), 'pending');
  generatedDesigners.forEach((acc, i) => {
    if (i < 80) pushDesigner(acc, 'approved');
    else if (i < 94) pushDesigner(acc, 'pending');
    else pushDesigner(acc, 'rejected', faker.helpers.arrayElement([
      'Licence number could not be verified with the issuing body.',
      'Portfolio details provided were incomplete. Please resubmit with project references.',
      'Company registration (UEN) does not match the company name supplied.',
    ]));
  });
  await insertMany('interior_designers', ['designer_id', 'registration_status', 'rejection_reason', 'reviewed_by', 'reviewed_at',
    'license_number', 'years_experience', 'specialisation', 'bio'], designerRows);

  // Activity log: the demo admin's approval decisions, at the time each one was reviewed
  const nameOf = new Map(accounts.map((a) => [a.account_id, a.full_name]));
  const auditRows = designerRows.filter((r) => r[1] !== 'pending').map((r) => [adminId,
    r[1] === 'approved' ? 'registration.approve' : 'registration.reject', 'registration', r[0],
    r[1] === 'approved' ? `Approved ${nameOf.get(r[0])}` : `Rejected ${nameOf.get(r[0])}: ${r[2]}`, r[4]]);
  await insertMany('admin_audit_log', ['actor_id', 'action', 'target_type', 'target_id', 'summary', 'created_at'], auditRows);

  const usedCompanyNames = new Set(['studio haven interiors']);
  const companyName = (i) => {
    if (i === 0) return 'Studio Haven Interiors';
    let name;
    do {
      name = `${faker.helpers.arrayElement(COMPANY_A)} ${faker.helpers.arrayElement(COMPANY_B)} ${faker.helpers.arrayElement(COMPANY_C)}`;
    } while (usedCompanyNames.has(name.toLowerCase()));
    usedCompanyNames.add(name.toLowerCase());
    return name;
  };
  const companyRows = designerMeta.map((d, i) => {
    const name = companyName(i);
    return [d.id, name,
      `${name} designs considered, liveable homes across Singapore. From the first site visit to final styling, we focus on ${faker.helpers.arrayElement(FEATURES)} and ${faker.helpers.arrayElement(FEATURES)}, with transparent pricing and clear timelines.`,
      null, `hello@${name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 18)}.example.com`, sgPhone(),
      faker.datatype.boolean() ? `https://${name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 18)}.example.com` : null,
      `${faker.number.int({ min: 1, max: 300 })} ${faker.helpers.arrayElement(['Ubi Ave 1', 'Kaki Bukit Rd 3', 'MacPherson Rd', 'Tai Seng St', 'Kallang Way'])}, Singapore`,
      d.created];
  });
  const companies = await insertMany('companies', ['designer_id', 'company_name', 'description', 'logo_url', 'contact_email',
    'contact_phone', 'website', 'address', 'created_at'], companyRows, 'company_id, designer_id');
  const areaRows = [];
  companies.forEach((c) => faker.helpers.arrayElements(REGIONS, { min: 1, max: 4 }).forEach((r) => areaRows.push([c.company_id, r])));
  await insertMany('company_service_areas', ['company_id', 'area_name'], areaRows);
  const certRows = [];
  companies.forEach((c) => {
    const meta = designerMeta.find((d) => d.id === c.designer_id);
    if (meta.status !== 'approved') return;
    faker.helpers.arrayElements(CERTS, { min: 1, max: 2 }).forEach(([title, issuer]) => {
      certRows.push([c.company_id, title, issuer, faker.number.int({ min: 2008, max: 2025 })]);
    });
  });
  await insertMany('certifications', ['company_id', 'title', 'issuer', 'year_obtained'], certRows);

  // ---- IDPs, photos, styles ----------------------------------------------
  const approved = designerMeta.filter((d) => d.status === 'approved');
  const idpRows = [];
  const idpStyles = [];
  const idpCategoryName = [];
  const styleId = Object.fromEntries(Object.entries(styleNames).map(([id, n]) => [n, Number(id)]));
  const allProjects = [...PROJECTS, ...generateProjects(COUNTS.idps, Object.values(styleNames), propertyTypes.map((p) => p.name))];
  allProjects.forEach((pr, k) => {
    // hand-written projects name their studio; the demo studio gets four generated ones too
    const designer = pr.studio !== null ? approved[pr.studio]
      : (k < PROJECTS.length + 4 ? approved[0] : faker.helpers.arrayElement(approved.slice(1)));
    const cat = categories.find((c) => c.name === pr.category);
    const pt = propertyTypes.find((p) => p.name === pr.type);
    const location = pr.location || pr.title.split(' in ').pop();
    const description = `This ${pt.name === 'HDB' ? 'HDB flat' : pt.name.toLowerCase()} project in ${location} was designed to ${faker.helpers.arrayElement(GOALS)}. `
      + `The brief called for a ${pr.styles.map((n) => n.toLowerCase()).join(' and ')} look, built around ${pr.detail}. `
      + `We kept the palette restrained and focused on durable, easy-care materials. The project took about ${faker.number.int({ min: 6, max: 16 })} weeks from design approval to handover.`;
    const created = randomDate(new Date(Math.max(new Date(designer.created).getTime(), daysAgo(DAYS_OF_HISTORY - 5).getTime())));
    idpRows.push([designer.id, cat.category_id, pt.property_type_id, pr.title, description, pr.status,
      pr.budget[0], pr.budget[1], location, created, created]);
    idpStyles.push(pr.styles.map((n) => styleId[n]));
    idpCategoryName.push(cat.name);
  });
  const idps = await insertMany('idps', ['designer_id', 'category_id', 'property_type_id', 'title', 'description', 'status',
    'budget_min', 'budget_max', 'location', 'created_at', 'updated_at'], idpRows, 'idp_id, created_at, designer_id');
  const styleRows = [];
  const photoRows = [];
  idps.forEach((idp, i) => {
    idpStyles[i].forEach((sid) => styleRows.push([idp.idp_id, sid]));
    allProjects[i].photos.forEach(([name, caption], order) => photoRows.push([idp.idp_id, roomUrl(name), caption, order]));
  });
  await insertMany('idp_styles', ['idp_id', 'style_id'], styleRows);
  await insertMany('idp_photos', ['idp_id', 'url', 'caption', 'sort_order'], photoRows);

  // ---- Engagement --------------------------------------------------------
  const weightedIdp = () => idps[Math.floor((faker.number.int({ min: 0, max: 999 }) / 1000) ** 1.6 * idps.length)];
  const viewRows = [];
  for (let i = 0; i < COUNTS.views; i += 1) {
    const idp = weightedIdp();
    viewRows.push([idp.idp_id, faker.datatype.boolean({ probability: 0.6 }) ? faker.helpers.arrayElement(customers).account_id : null,
      randomDate(new Date(idp.created_at))]);
  }
  await insertMany('idp_views', ['idp_id', 'viewer_id', 'viewed_at'], viewRows);

  const favPairs = new Set();
  const favRows = [];
  const demoFavs = idps.slice(8, 13);
  demoFavs.forEach((idp) => { favPairs.add(`${demoCustomer.account_id}:${idp.idp_id}`); favRows.push([demoCustomer.account_id, idp.idp_id, randomDate(new Date(idp.created_at))]); });
  while (favRows.length < COUNTS.favourites) {
    const c = faker.helpers.arrayElement(customers);
    const idp = weightedIdp();
    const key = `${c.account_id}:${idp.idp_id}`;
    if (!favPairs.has(key)) {
      favPairs.add(key);
      favRows.push([c.account_id, idp.idp_id, randomDate(new Date(Math.max(new Date(idp.created_at), new Date(c.created_at))))]);
    }
  }
  await insertMany('favourites', ['customer_id', 'idp_id', 'created_at'], favRows);

  const enquiryRows = [];
  for (let i = 0; i < COUNTS.enquiries; i += 1) {
    const idp = i < 12 ? idps[i % 8] : weightedIdp();
    const c = i < 2 ? demoCustomer : faker.helpers.arrayElement(customers);
    enquiryRows.push([idp.idp_id, c.account_id, idp.designer_id, faker.helpers.arrayElement(ENQUIRY_LINES),
      faker.datatype.boolean() ? sgPhone() : null, faker.datatype.boolean({ probability: 0.6 }) ? 'read' : 'new',
      randomDate(new Date(Math.max(new Date(idp.created_at), new Date(c.created_at))))]);
  }
  await insertMany('enquiries', ['idp_id', 'customer_id', 'designer_id', 'message', 'contact_phone', 'status', 'created_at'], enquiryRows);

  const searchRows = [];
  for (let i = 0; i < COUNTS.searches; i += 1) {
    const filters = {};
    if (faker.datatype.boolean()) filters.categoryId = faker.helpers.arrayElement(categories).category_id;
    if (faker.datatype.boolean({ probability: 0.3 })) filters.location = faker.helpers.arrayElement(LOCATIONS);
    searchRows.push([faker.datatype.boolean() ? faker.helpers.arrayElement(customers).account_id : null,
      faker.datatype.boolean({ probability: 0.7 }) ? faker.helpers.arrayElement(SEARCH_TERMS) : null,
      JSON.stringify(filters), faker.number.int({ min: 0, max: 40 }), randomDate(daysAgo(DAYS_OF_HISTORY))]);
  }
  await insertMany('search_logs', ['account_id', 'keyword', 'filters', 'result_count', 'searched_at'], searchRows);

  // ---- Reports (generated by the real Control classes) ---------------------
  console.log('Generating report history...');
  const actor = { accountId: managerAccount.account_id };
  const today = dates.today(config.timezone);
  const daily = new Rep.GenerateDailyReportController();
  const weekly = new Rep.GenerateWeeklyReportController();
  const monthly = new Rep.GenerateMonthlyReportController();
  const custom = new Rep.GenerateCustomReportController();
  for (let i = 75; i >= 1; i -= 1) await daily.execute(actor, { date: dates.addDays(today, -i) }); // eslint-disable-line no-await-in-loop
  for (let i = 13; i >= 1; i -= 1) await weekly.execute(actor, { weekStart: dates.addDays(today, -7 * i) }); // eslint-disable-line no-await-in-loop
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    await monthly.execute(actor, { month: d.toISOString().slice(0, 7) }); // eslint-disable-line no-await-in-loop
  }
  for (const span of [7, 14, 30, 60, 90, 180]) {
    await custom.execute(actor, { start: dates.addDays(today, -span), end: today }); // eslint-disable-line no-await-in-loop
  }

  // ---- Summary -------------------------------------------------------------
  const tables = ['user_profiles', 'user_accounts', 'interior_designers', 'companies', 'company_service_areas', 'certifications',
    'idp_categories', 'design_styles', 'property_types', 'idps', 'idp_styles', 'idp_photos', 'idp_views', 'favourites',
    'enquiries', 'search_logs', 'reports', 'admin_audit_log'];
  console.log('\nInserted records');
  for (const t of tables) {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM ${t}`); // eslint-disable-line no-await-in-loop
    console.log(`  ${t.padEnd(24)} ${String(rows[0].n).padStart(5)}`);
  }
  console.log('\nDemo accounts (development only)');
  Object.entries(DEMO).forEach(([k, d]) => console.log(`  ${k.padEnd(9)} ${d.email.padEnd(34)} ${d.password}`));
  console.log(`  generated accounts use the password: ${GENERATED_PASSWORD}`);
}

main()
  .then(() => db.pool.end())
  .catch((err) => {
    console.error('Seeding failed:', err);
    db.pool.end();
    process.exit(1);
  });
