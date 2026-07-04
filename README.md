# رفوف · rofoof

Commercial storefront for **rofoof.iq** — Iraqi-made stickers, brooches, 3D medals, and posters. Bilingual (Arabic/English, RTL-first), with a full customer storefront and an admin dashboard.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** with a custom warm "bookshop" design system, dark mode via `next-themes`
- **Supabase**: Postgres + Row-Level Security, Auth (email/password + Google OAuth), Storage, Realtime

## Features

- Storefront: home, store (search/category/fandom/price/waterproof filters + pagination), product quick-view with image gallery, cart → checkout → WhatsApp confirmation, order tracking, favorites, order history.
- Admin dashboard (`/dashboard`, admin-only): KPI overview, Kanban order board, full product CRUD (multi-image, multi-category, discounts), customers list — all with real server-paginated infinite scroll.
- Discounted pricing, dynamic categories/fandoms (admins can add new ones inline), soft-delete throughout.

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in your Supabase project's URL/keys, plus the store's WhatsApp number and Instagram URL.
3. Run the SQL migrations in `supabase/migrations/` (in order) against your Supabase project, or use `supabase/apply_all.sql` for a one-shot setup. `supabase/seed_test_data.sql` seeds sample products/orders for local testing.
4. Make yourself an admin:
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
5. Start the dev server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — ESLint
