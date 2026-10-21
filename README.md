# Syft

Discover and share lists about anything: books, music, movies, products, places.

Syft is a multi-page vanilla JavaScript app built with [Vite](https://vitejs.dev), [Tailwind CSS v4](https://tailwindcss.com), and [Supabase](https://supabase.com) (auth, Postgres, storage, and edge functions).

## Prerequisites

- **Node.js 20+** and npm
- A **Supabase project**, either hosted at [supabase.com](https://supabase.com) or local via the Supabase CLI
- *(Optional)* the [Supabase CLI](https://supabase.com/docs/guides/cli) for running migrations and deploying edge functions

## Running locally

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Then fill in `.env` with your project's values. You'll find them in the Supabase dashboard under **Project Settings → API**:

   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

   The app throws `Missing Supabase environment variables` on load if either is missing.

3. **Start the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:5173](http://localhost:5173). The server binds to `0.0.0.0`, so you can also reach it from other devices on your network, such as a phone, using the "Network" URL Vite prints.

## Setting up a new Supabase project

Skip this if you're pointing at an existing Syft database.

1. **Apply the database migrations** in `supabase/migrations/`, in numeric order. With the CLI:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   You can also paste each file into the dashboard's SQL editor, in order. The migrations create the tables, RLS policies, triggers, and storage buckets.

2. **Deploy the edge functions** in `supabase/functions/`:

   | Function | Purpose |
   | --- | --- |
   | `scrape-item` | Fetches metadata for an item URL when it's added to a list (called from `src/lib/db.js`) |
   | `og-image` | Generates Open Graph share images |
   | `migrate-images` | One-off utility that copies external cover images into Supabase Storage |

   ```bash
   supabase functions deploy scrape-item
   supabase functions deploy og-image
   supabase functions deploy migrate-images
   ```

   `scrape-item` needs a Google Places API key for place lookups:

   ```bash
   supabase secrets set GOOGLE_PLACES_API_KEY=<your-key>
   ```

   Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the functions automatically.

3. **Configure auth redirect URLs.** Under **Authentication → URL Configuration**, add `http://localhost:5173` so login redirects work during development.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server on port 5173 |
| `npm run build` | Build for production into `dist/` |
| `npm run preview` | Serve the production build locally |

The project has no tests or linting.

## Project structure

```
├── index.html, login.html, profile.html, list.html, settings.html   # Page entry points
├── public/              # Static assets, PWA manifest, service worker, CNAME
├── src/
│   ├── lib/             # Data layer: Supabase client, auth, db queries, cache
│   ├── pages/           # Per-page logic
│   ├── utils/           # Shared UI helpers, nav, route guards
│   ├── components/      # Reusable UI components
│   └── styles/          # CSS (Tailwind)
└── supabase/
    ├── migrations/      # SQL schema migrations
    └── functions/       # Deno edge functions
```

See [AGENTS.md](AGENTS.md) for code style and conventions.

## Deployment

Each push to `main` builds the site and deploys it to GitHub Pages (`.github/workflows/deploy.yml`), served at `syft.maximsiebert.com`. The workflow reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the repository's Actions secrets.
