# FabWorks Hub

Business management app for an iron fabrication workshop — clients & leads, labour
(attendance + task assignment), and a quotation calculator. Built with Vite + React +
TypeScript + Tailwind + shadcn/ui on a Supabase backend; deploys to Vercel.

## Features

- **Dashboard** — leads, clients, today's attendance and open quotations at a glance
- **Clients & Leads** — CRM pipeline: new lead → contacted → quote sent → client / lost
- **Labour** — worker records with daily wage, one-tap daily attendance
  (present / half-day / absent) with monthly day counts, and weekly/monthly task
  assignment with status tracking
- **Quotations** — calculator (materials × ₹/kg + labour + transport + margin + GST),
  saved quotes with draft/sent/accepted/rejected status

Works on desktop (sidebar layout) and mobile (bottom navigation).

## Local setup

```sh
npm install
cp .env.example .env   # fill in Supabase URL + anon key
npm run dev            # http://localhost:8082
```

## Backend (Supabase)

1. Create a Supabase project and apply `supabase/migrations/20260703000001_init.sql`
   (SQL editor or `supabase db push`).
2. Create the owner's account in Authentication → Users ("Add user", confirm email).
   The **first** account created automatically becomes admin; later signups are
   `pending` until an admin changes their role in the `profiles` table.
3. In Authentication → Sign In / Up, **disable new user signups** once the owner
   accounts exist.
4. Copy Project Settings → API values into `.env`.

## Security notes

- All tables have Row Level Security: only `admin`-role profiles can read or write.
- The `VITE_SUPABASE_ANON_KEY` is safe to expose in the frontend; the `service_role`
  key must never leave the Supabase dashboard.
- `.env` is git-ignored — set the same two variables in Vercel's project settings
  when deploying.

## Deploy (Vercel)

Import the GitHub repo in Vercel — it auto-detects Vite. Add the two `VITE_*`
environment variables, deploy. `vercel.json` already handles SPA routing.
