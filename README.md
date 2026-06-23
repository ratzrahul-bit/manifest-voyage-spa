# Vessel Manifest Exchange

Plain React SPA — no SSR, deploys free on Netlify.

## Deploy steps

### 1. Supabase setup
- Create project at supabase.com
- Go to SQL Editor → paste contents of `supabase_schema.sql` → Run
- Go to Settings → API → copy Project URL and anon key

### 2. Netlify deploy
- Push this repo to GitHub
- Go to netlify.com → Add new site → Import from Git → select repo
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Add environment variables:
  - `VITE_SUPABASE_URL` = your Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
  - `VITE_ADMIN_EMAIL` = rathirahulraj@gmail.com
- Deploy

### 3. First login
- Go to your site → Register with rathirahulraj@gmail.com → auto-promoted to Admin
- Add other users by approving their registrations in the Admin panel

## User roles
- **Admin** — approves users, sees all manifests
- **Shipping Line** — uploads manifests, sees own uploads only  
- **CHA** — uploads and downloads all manifests
