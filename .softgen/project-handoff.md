# Grand Archive TCG Collection Manager - Project Handoff

**Last Updated:** 2026-04-29  
**Status:** In Development (~45% Complete)  
**Project Type:** Full-stack web application for Grand Archive TCG card collection management

---

## 🎯 Project Vision

Build a comprehensive Grand Archive TCG collection management platform similar to Dreamborn.ink (for Lorcana) but tailored for Grand Archive TCG. Core features include:

- **User Authentication** - Personal accounts with secure login
- **Card Database** - Browse all Grand Archive TCG cards from all sets
- **Collection Tracking** - Mark owned cards with quantities
- **Location Tagging** - Organize cards by physical location (binder, deck box, etc.)
- **Deck Builder** - Create decks with real-time owned card indicators
- **Smart Inventory** - Deck builder shows: "You own 2/4 copies, located in: Binder A, Deck Box 1"

---

## 🛠 Tech Stack

### Frontend
- **Framework:** Next.js 15.2 (Page Router)
- **Language:** TypeScript 5.x
- **Styling:** Tailwind CSS 3.4
- **UI Components:** shadcn/ui (pre-installed in `src/components/ui/`)
- **Icons:** Lucide React

### Backend
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth (email/password by default)
- **API:** Next.js API Routes (`src/pages/api/`)
- **External API:** Grand Archive TCG API (`https://api.gatcg.com`)

### Infrastructure
- **Hosting:** Vercel (production)
- **Development:** Daytona.io sandbox
- **Process Manager:** PM2 (in development)

---

## 📊 Database Schema

### Tables

#### `cards` (3,861 records)
Stores all Grand Archive TCG card data synced from the official API.

```sql
- id (uuid, PK)
- set_id (uuid, FK → sets.id)
- name (text)
- card_number (text)
- element (text, nullable)
- card_type (text)
- class (text, nullable)
- rarity (text)
- cost (integer, nullable)
- power (integer, nullable)
- life (integer, nullable)
- effect_text (text, nullable)
- flavor_text (text, nullable)
- image_url (text, nullable)
- illustrator (text, nullable)
- created_at (timestamp)
- updated_at (timestamp)

UNIQUE CONSTRAINT: (set_id, card_number)
```

#### `sets` (38 records)
Card set information (e.g., "Dawn of Ashes", "Fractured Crown").

```sql
- id (uuid, PK)
- code (text, UNIQUE)
- name (text)
- release_date (date, nullable)
- created_at (timestamp)
```

#### `profiles` (user profiles)
Auto-created when users sign up via Supabase Auth trigger.

```sql
- id (uuid, PK, FK → auth.users.id)
- email (text)
- full_name (text, nullable)
- created_at (timestamp)
- updated_at (timestamp)
```

#### `collections` (user card collections)
Tracks which cards users own and quantities.

```sql
- id (uuid, PK)
- user_id (uuid, FK → profiles.id)
- card_id (uuid, FK → cards.id)
- quantity (integer, default 1)
- location (text, nullable)
- notes (text, nullable)
- created_at (timestamp)
- updated_at (timestamp)

UNIQUE CONSTRAINT: (user_id, card_id)
```

#### `decks` (user deck lists)
```sql
- id (uuid, PK)
- user_id (uuid, FK → profiles.id)
- name (text)
- description (text, nullable)
- format (text, nullable)
- is_public (boolean, default false)
- created_at (timestamp)
- updated_at (timestamp)
```

#### `deck_cards` (cards in decks)
```sql
- id (uuid, PK)
- deck_id (uuid, FK → decks.id)
- card_id (uuid, FK → cards.id)
- quantity (integer, default 1)
- is_sideboard (boolean, default false)
- created_at (timestamp)

UNIQUE CONSTRAINT: (deck_id, card_id, is_sideboard)
```

### RLS (Row Level Security) Policies

**cards & sets:** Public read access (all users can view all cards)
**profiles:** Users can only read/update their own profile
**collections:** Users can only view/manage their own collection
**decks:** Users can view public decks + manage their own decks
**deck_cards:** Follows deck permissions

---

## 🔌 External API Integration

### Grand Archive TCG API
- **Base URL:** `https://api.gatcg.com`
- **Docs:** https://api.gatcg.com/docs
- **Used Endpoint:** `/cards/search?separate_editions=true&page={page}&limit={limit}`

### Data Sync Process
Located in: `src/pages/api/sync-cards.ts`

**How it works:**
1. Fetches cards from official API with `separate_editions=true` parameter
2. Paginates through all pages (100 cards per page, ~45 pages total)
3. Processes ALL editions from each card's `editions` array (not just the first one)
4. Extracts unique sets from edition data
5. Upserts sets first (prevents FK constraint errors)
6. Maps set codes to set IDs
7. Creates database entry for EACH edition (same card name can have 5+ different printings)
8. Deduplicates using `(set_id, card_number, rarity, image_url)` to preserve extended art variants
9. Upserts cards with proper set_id references
10. **Fetches restricted cards separately** (pagination through all 5 pages)
11. Updates `is_restricted` field for all restricted card names
12. Real-time progress tracking via `/api/sync-progress` endpoint

**Key Technical Details:**
- **Deduplication Key:** `${set_id}_${card_number}_${rarity}_${image_url}` 
  - Includes image_url to preserve extended art variants (e.g., RDOPD vs RDOPD-ext)
  - Includes rarity to preserve multiple rarities per set (e.g., ALCSD Common vs ALCSD CSR)
- **Database Constraint:** `UNIQUE (set_id, card_number, rarity, image_url)`
- **Incremental Sync:** Only fetches new sets if database already populated (saves time)
- **Progress Tracking:** Real-time updates via polling (1-second interval)
- **Error Handling:** Comprehensive error logging with sync history tracking
- **Restricted Card Sync:** 
  - Separate API call to `/cards/search?legality_format=STANDARD&legality_state=RESTRICTED`
  - Paginates through all pages (page 1-5, 100 limit per page)
  - Captures 107 unique restricted card names (121 total printings)
  - Updates database after card sync completes

**Important Notes:**
- The `/cards/search?separate_editions=true` API returns each card with ALL its editions in the `editions` array
- Extended art variants have same set/number/rarity but different image URLs
- CSR variants have different rarity values (7 = CSR) in the same set
- Database unique constraint matches deduplication key to prevent overwrites
- Restricted cards require separate API call because legality data is not available with `separate_editions=true`

**To trigger sync:** 
- Navigate to `/cards` page
- Click "Update Database" (incremental sync - only new sets)
- Click "Full Re-sync" (complete database rebuild - use when needed)

**Sync Stats:**
- Total Cards Synced: 4,395 card printings (as of 2026-05-11)
- Total Sets: 55
- Restricted Cards: 107 unique card names (121 printings)
- Sync Duration: ~3-5 minutes (full sync), 10-30 seconds (incremental if no new sets)
- Last Major Update: 2026-05-11 - Added paginated restricted card sync (captures all 107 restricted cards)

**✅ Confirmed Working Examples:**
- **Arisanna, Astral Zenith:** All 5 printings captured correctly:
  - ALC Common
  - ALCSD Common
  - ALCSD CSR (rarity-based differentiation)
  - RDOPD Common
  - RDOPD-ext Common (image-based differentiation)
- **Baby Green Slime:** Properly marked as restricted
- **All 107 restricted cards:** Captured via paginated API calls

**⚠️ Known API Limitation:** While our sync now captures all variants the API returns, the Grand Archive API itself may not expose 100% of printings visible on the official index website. The sync is working correctly - any missing cards are due to upstream API incompleteness.

---

## 📁 Project Structure

```
src/
├── components/           # React components
│   ├── ui/              # shadcn/ui components (pre-installed)
│   ├── Navigation.tsx   # Main navigation bar
│   ├── SEO.tsx          # SEO meta tags component
│   └── ThemeSwitch.tsx  # Dark/light mode toggle
├── contexts/
│   └── ThemeProvider.tsx
├── hooks/
│   ├── useAuth.tsx      # Authentication hook
│   ├── use-mobile.tsx
│   └── use-toast.ts
├── integrations/
│   └── supabase/
│       ├── client.ts            # Supabase client instance
│       ├── types.ts             # Database types (auto-generated)
│       └── database.types.ts    # Raw DB types (auto-generated)
├── lib/
│   └── utils.ts         # Utility functions (cn, etc.)
├── pages/
│   ├── api/             # Next.js API routes
│   │   ├── sync-cards.ts        # Card sync API
│   │   ├── debug-sync.ts        # Debug endpoint
│   │   └── test-api.ts          # API testing
│   ├── auth/
│   │   ├── login.tsx            # Login page
│   │   └── signup.tsx           # Signup page
│   ├── cards/
│   │   └── index.tsx            # Card browsing (ACTIVE)
│   ├── collection/
│   │   └── index.tsx            # User collection view
│   ├── decks/
│   │   ├── index.tsx            # Deck list
│   │   └── [id].tsx             # Deck detail/editor
│   ├── _app.tsx         # App wrapper
│   ├── _document.tsx    # HTML document
│   └── index.tsx        # Homepage
├── services/            # Business logic layer
│   ├── authService.ts   # Auth operations
│   ├── cardService.ts   # Card CRUD + batched fetching
│   ├── deckService.ts   # Deck CRUD
│   └── gatcgApiService.ts # External API wrapper
└── styles/
    └── globals.css      # Global styles + Tailwind config
```

---

## ✅ Implemented Features

### 1. Card Database & Browsing (`/cards`)
**Status:** ✅ Complete  
**Files:** `src/pages/cards/index.tsx`, `src/services/cardService.ts`, `src/pages/api/sync-cards.ts`

**Features:**
- **Card Sync:** One-click sync from Grand Archive API with `separate_editions=true`
- **Real-time Progress:** Live progress bar with page count and card count updates
- **Incremental Sync:** Only fetches new sets when database already populated (fast updates)
- **Full Re-sync:** Option to rebuild entire database when needed
- **All Printings:** Captures ALL editions returned by API including:
  - Extended art variants (same set/number/rarity, different images)
  - Multiple rarities per set (e.g., ALCSD Common + ALCSD CSR)
  - All promotional printings available in the API
- **Batched Fetching:** Overcomes Supabase's 1,000 row limit by fetching in batches
- **Pagination:** 120 cards per page (6 columns on xl screens) with page number input
- **Search:** Real-time card name search
- **Card Grouping:** Cards with same name are condensed into one thumbnail
  - Shows "X printings" count below card name when multiple versions exist
  - Modal allows cycling through all printings via dropdown selector
- **Card Display:** 
  - Thumbnail: Image + name only (minimal design)
  - Red "Restricted" badge overlays on top-right corner of card image (if restricted)
  - Hover effect: border color change + slight image scale
- **Card Detail Modal:**
  - Left side: Card image at 95% size (5% smaller than default)
  - Set printing selector dropdown below image (shows "Set Name - Rarity")
  - Right side: All card details (Name, Rarity, Type, Element, Cost, Effect, Power, Life, Speed, Class, Illustrator)
  - Element and Type displayed in Title Case (e.g., "Astra" not "ASTRA", "Champion — Cleric Human" not "CHAMPION — CLERIC HUMAN")
- **Navigation:** Previous/Next, jump to page, First/Last buttons
- **Database Status:** Shows total cards, sets, and last sync date

**Technical Achievements:**
- ✅ Correct deduplication logic: `(set_id, card_number, rarity, image_url)`
- ✅ Extended art variant preservation (RDOPD vs RDOPD-ext)
- ✅ Multiple rarity handling (ALCSD Common + CSR on same card number)
- ✅ Real-time sync progress tracking
- ✅ Sync history tracking in database
- ✅ Error handling and recovery
- ✅ Restricted card tracking with full pagination (107 unique cards, 121 printings)

**Restricted Card Sync:**
- Fetches restricted cards from `https://api.gatcg.com/cards/search?legality_format=STANDARD&legality_state=RESTRICTED`
- Properly paginates through all 5 pages of the API endpoint (100 cards per page)
- Captures all 107 unique restricted card names (121 total printings)
- Updates database after each sync to mark restricted cards
- Red "Restricted" badge appears on card thumbnails and in modal header

**Verified Working:**
- All 5 Arisanna, Astral Zenith printings sync correctly
- CSR rarity mapping (value 7 → "CSR")
- Extended art differentiation via image URLs
- 4,395 total card printings from 55 sets
- 107 unique restricted cards properly tagged

### 2. Authentication System
**Status:** ✅ Complete  
**Files:** `src/pages/auth/`, `src/services/authService.ts`

- **Login Page:** `/auth/login`
- **Signup Page:** `/auth/signup`
- **Session Management:** Persistent auth via Supabase
- **Profile Auto-Create:** Trigger creates profile row on signup

### 3. Database Schema
**Status:** ✅ Complete  
**Files:** `supabase/migrations/`

All tables created with proper:
- Foreign key constraints
- Unique constraints
- RLS policies
- Indexes for performance

---

## 🚧 Partially Implemented

### Collection Page (`/collection`)
**Status:** 🟡 UI exists, needs backend integration  
**Files:** `src/pages/collection/index.tsx`

**Current State:**
- Page exists with UI layout
- Displays placeholder data
- Has filters for rarity, element, set

**Needs:**
- Connect to `collections` table
- Add "Add to Collection" button on card pages
- Implement quantity tracking
- Add location tagging UI

### Deck Builder (`/decks`)
**Status:** 🟡 UI exists, needs backend integration  
**Files:** `src/pages/decks/index.tsx`, `src/pages/decks/[id].tsx`

**Current State:**
- Deck list page exists
- Deck detail/editor page exists
- Basic UI for adding/removing cards

**Needs:**
- Connect to `decks` and `deck_cards` tables
- Implement owned card indicators
- Add location display for owned cards
- Deck legality checker
- Export/import functionality

---

## 🔴 Not Yet Implemented

### Filters & Advanced Search
**Priority:** High  
**Needed For:** Better card browsing UX

**Requirements:**
- Filter by: Rarity, Element, Type, Class, Set, Cost
- Multi-select filters (e.g., Fire OR Water)
- Clear all filters button
- Filter counts (e.g., "Rare (487)")

**Implementation Notes:**
- Add filter state to `src/pages/cards/index.tsx`
- Update `cardService.getCards()` to accept filter params
- Add filter UI in sidebar or top bar

### Location Tagging System
**Priority:** High  
**Needed For:** Core feature requirement

**Requirements:**
- Create/manage custom locations (e.g., "Binder A", "Deck Box 1")
- Assign location when adding card to collection
- Filter collection by location
- Show location in deck builder

**Database Changes:**
```sql
CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES profiles(id),
  name text NOT NULL,
  description text,
  created_at timestamp DEFAULT now()
);

ALTER TABLE collections ADD COLUMN location_id uuid REFERENCES locations(id);
```

### Deck Builder Enhancements
**Priority:** Medium  
**Needed For:** Core feature requirement

**Requirements:**
1. **Owned Card Indicator:**
   - Show "You own 2/4" for each card in deck
   - Color-code: green (have enough), yellow (have some), red (need all)

2. **Location Display:**
   - "Your copies are in: Binder A (2), Deck Box 1 (1)"
   - Click to navigate to collection

3. **Missing Cards List:**
   - "You need: 2x [Card Name], 1x [Card Name]"
   - Total missing count

### User Dashboard
**Priority:** Low  
**Not yet created**

**Requirements:**
- Collection stats (total cards, unique cards, completion %)
- Recent activity (cards added, decks created)
- Quick links to popular decks/cards

---

## 🐛 Known Issues & Limitations

### 1. Image Loading Performance
**Issue:** Loading 120 card images per page can be slow on poor connections  
**Impact:** Page feels sluggish on initial load  
**Potential Solutions:**
- Lazy load images (intersection observer)
- Add loading skeletons
- Implement image CDN/optimization

### 2. Search Performance
**Issue:** Client-side search on 4,000+ cards causes UI lag  
**Impact:** Typing in search box feels unresponsive  
**Fix Needed:** Move search to backend (server-side filtering)

### 3. No Dark/Light Mode Toggle
**Issue:** ThemeSwitch component exists but not in Navigation  
**Impact:** Users stuck in one theme  
**Fix:** Add ThemeSwitch to Navigation component

### 4. Extended Art Variant Naming
**Issue:** Extended art cards show same card number as regular versions (e.g., both RDOPD versions show as "006")
**Impact:** Hard to tell which is extended art without comparing images
**Potential Solution:** Add `-ext` suffix to card_number or create separate `variant` field in database

### 5. Card Grouping in Search
**Issue:** When searching for cards, only one printing per unique name is shown
**Impact:** Users might not realize a card has multiple printings without clicking into the modal
**Current Workaround:** Modal shows "X printings" count and dropdown selector

---

## 🔮 Future Roadmap

### Phase 1: Core Features (Priority)
- [ ] Implement filters (rarity, element, type, class, set)
- [ ] Connect collection page to backend
- [ ] Add "Add to Collection" functionality
- [ ] Implement location tagging system
- [ ] Connect deck builder to backend

### Phase 2: Deck Builder Enhancement
- [ ] Owned card indicators in deck builder
- [ ] Location display for owned cards
- [ ] Missing cards list
- [ ] Deck legality checker
- [ ] Export deck to text/image

### Phase 3: Polish & UX
- [ ] User dashboard with stats
- [ ] Collection completion tracking
- [ ] Advanced search (multiselect filters)
- [ ] Image optimization/lazy loading
- [ ] Mobile responsive improvements

### Phase 4: Community Features
- [ ] Public deck sharing
- [ ] Deck upvoting/comments
- [ ] Trading system (card wants/haves)
- [ ] User profiles with collection showcase

### Phase 5: Data Completeness
- [ ] Manual printing entry system
- [ ] Community missing printing reports
- [ ] Extended art variant tracking
- [ ] Alternative art tracking

---

## 🚀 Setup & Development

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account

### Environment Variables
Create `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### Installation
```bash
npm install
npm run dev
```

### Database Setup
1. Run migrations in `supabase/migrations/`
2. Enable RLS on all tables
3. Run card sync via UI (`/cards` → "Sync Card Database")

### Common Commands
```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run lint         # Run ESLint
pm2 restart all      # Restart PM2 services (in dev)
```

---

## 📝 Key Architectural Decisions

### 1. Why Page Router over App Router?
- Template was pre-configured with Page Router
- More stable for complex routing needs
- Easier file-based routing for dynamic pages

### 2. Why Supabase over Firebase?
- PostgreSQL (better for relational data like cards/decks)
- Built-in RLS for security
- Open source and self-hostable
- Better TypeScript support

### 3. Why Client-Side Filtering for Now?
- Simple initial implementation
- No backend complexity
- Good enough for <5,000 cards
- Will migrate to server-side when performance degrades

### 4. Why Batched Fetching?
- Supabase has hard 1,000 row limit per request
- Batching is transparent to frontend
- No pagination needed for simple "get all cards"

---

## 🔧 Debugging & Troubleshooting

### Card Sync Issues
1. Check API endpoint: `https://api.gatcg.com/cards/search`
2. Check PM2 logs: `pm2 logs --lines 100`
3. Check browser console for errors
4. Verify Supabase RLS policies allow inserts
5. Check if sets exist in `sets` table (common cause of "No set_id found" warnings)

### Database Issues
1. Run: `<get_database_schema></get_database_schema>`
2. Check foreign key constraints
3. Verify RLS policies are correct
4. Check unique constraints aren't blocking inserts

### Authentication Issues
1. Check `.env.local` has correct Supabase keys
2. Verify auth is enabled in Supabase dashboard
3. Check RLS policies on `profiles` table
4. Verify email confirmation is disabled (if testing)

### Missing Card Printings
1. Check official index: https://index.gatcg.com
2. Search by card name to see all printings
3. Note any printings with `-ext` suffix (extended art)
4. Note any CSR/special variants
5. File manual entry request if critical for collection

---

## 📚 Useful References

- **Grand Archive API Docs:** https://api.gatcg.com/docs
- **Grand Archive Official Index:** https://index.gatcg.com
- **Supabase Docs:** https://supabase.com/docs
- **shadcn/ui Components:** https://ui.shadcn.com
- **Next.js Page Router:** https://nextjs.org/docs/pages
- **Tailwind CSS:** https://tailwindcss.com/docs

---

## 👤 Contact & Support

**Project Type:** Grand Archive TCG Collection Manager  
**Status:** Active Development  
**Last Major Update:** 2026-04-29

**Recent Changes:**
- Card sync complete with 3,861 cards from 38 sets
- CSR rarity mapping fixed (Aella now shows correct rarity)
- Missing sets added (DOA First Edition, Supporter Pack 2)
- Documented API data incompleteness limitation
- Deduplication logic prevents duplicate key errors

**Known Limitations:**
- API doesn't return all printings (extended art, some CSR variants)
- Manual tracking may be needed for complete collections
- Community input valuable for discovering missing printings

---

*This document will be updated with each major feature implementation or architectural change.*