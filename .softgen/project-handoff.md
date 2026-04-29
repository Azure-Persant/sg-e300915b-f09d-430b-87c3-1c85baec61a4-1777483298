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

#### `cards` (3,859 records)
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
- **Used Endpoint:** `/cards/search?page={page}&limit={limit}`

### Data Sync Process
Located in: `src/pages/api/sync-cards.ts`

**How it works:**
1. Fetches cards from official API in batches of 100 per page (75 total pages)
2. Extracts unique sets from card data
3. Upserts sets first (prevents FK constraint errors)
4. Maps set codes to set IDs
5. Processes ALL editions from each card's `editions` array
6. Deduplicates cards within each batch to prevent "cannot affect row a second time" errors
7. Upserts cards with proper set_id references
8. Progress tracked via frontend toasts

**Important Notes:**
- The `/cards/search` API endpoint returns multiple editions per card in the `editions` array
- Each edition is processed as a separate database entry (same card, different sets/printings)
- Deduplication happens within each batch based on `(set_id, card_number)` combination
- Missing sets are now manually added if discovered (e.g., DOA First Edition, SP2)

**To trigger sync:** Navigate to `/cards` and click "Sync Card Database" button

**Sync Stats:**
- Total API Pages: 75
- Cards Per Page: ~30-100 (varies)
- Total Cards Synced: 3,861 printings
- Unique Card Names: 2,222
- Total Sets Synced: 38
- CSR Rarity Mapping: ✅ Complete
- Missing Sets Fixed: DOA First Edition (275 cards), Supporter Pack 2 (43 cards)
- Sync Duration: ~3-5 minutes

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
**Files:** `src/pages/cards/index.tsx`, `src/services/cardService.ts`

- **Card Sync:** One-click sync from Grand Archive API
- **Batched Fetching:** Overcomes Supabase's 1,000 row limit by fetching in batches
- **Pagination:** 100 cards per page with page number input
- **Search:** Real-time card name search
- **Card Display:** Image, name, rarity, cost, power/life stats
- **Navigation:** Previous/Next, jump to page, First/Last buttons
- **All Printings:** Captures all editions/printings of each card (e.g., 6 Aesan Protector versions)

**Technical Notes:**
- Supabase has a hard 1,000 row limit per request
- Implemented batched fetching in `cardService.getCards()`:
  ```typescript
  while (hasMore) {
    query.range(from, from + 999);
  }
  ```

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

### 1. Card Sync - API Inconsistency
**Issue:** Some cards return all editions in the API, others return only 1  
**Impact:** Required manual addition of missing sets (DOA First Edition, SP2)  
**Status:** ✅ Fixed - Missing sets manually added, sync now captures all available cards

### 2. Image Loading Performance
**Issue:** Loading 100 card images per page can be slow on poor connections  
**Impact:** Page feels sluggish on initial load  
**Potential Solutions:**
- Lazy load images (intersection observer)
- Add loading skeletons
- Implement image CDN/optimization

### 3. Search Performance
**Issue:** Client-side search on 3,861 cards causes UI lag  
**Impact:** Typing in search box feels unresponsive  
**Fix Needed:** Move search to backend (server-side filtering)

### 4. No Dark/Light Mode Toggle
**Issue:** ThemeSwitch component exists but not in Navigation  
**Impact:** Users stuck in one theme  
**Fix:** Add ThemeSwitch to Navigation component

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

---

## 📚 Useful References

- **Grand Archive API Docs:** https://api.gatcg.com/docs
- **Supabase Docs:** https://supabase.com/docs
- **shadcn/ui Components:** https://ui.shadcn.com
- **Next.js Page Router:** https://nextjs.org/docs/pages
- **Tailwind CSS:** https://tailwindcss.com/docs

---

## 👤 Contact & Support

**Project Type:** Grand Archive TCG Collection Manager  
**Status:** Active Development  
**Last Major Update:** 2026-04-29 - Card sync complete with all editions (3,861 cards, 38 sets)

---

*This document will be updated with each major feature implementation or architectural change.*