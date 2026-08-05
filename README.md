# Wallet Weaver

Build a complete multi-tenant Mobile Wallet Loyalty SaaS application in a single codebase with role-based routing, native Arabic RTL support with an English UI toggle, dynamic subdomain routing, custom visual pass previews, and Supabase database integration.

### 1. API Credentials & Supabase Configuration:

- Supabase Project URL: https://cxtmckbpnjxkrsuwlvwl.supabase.co

- Supabase Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4dG1ja2Jwbmp4a3JzdXdsdndsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4ODkyMjgsImV4cCI6MjEwMTQ2NTIyOH0.YjQudMUVdnwSQQiKCx3K8UZjC6aIJcnK-stdyUIeZHU

- Wallet Pass Engine: Create Supabase Edge Functions to proxy all pass creation and push notification requests to `https://api.walletwallet.com/v1` using the `WALLETWALLET_API_KEY` environment secret.

---

### 2. Design System & Theme Rules ("Modern Saudi Emerald & Slate"):

- **Default Locale:** Arabic first with full Right-to-Left (RTL) layout support. Provide a top navbar toggle to switch seamlessly between Arabic and English.

- **Typography:** Use `Tajawal` or `IBM Plex Sans Arabic` for Arabic text, and `Inter` or `Plus Jakarta Sans` for English text.

- **Color Palette Tokens:**

  - Primary Brand Action (Emerald Green): `#059669` (Tailwind `emerald-600`)

  - Accent / Loyalty Highlights (Warm Amber Gold): `#F59E0B` (Tailwind `amber-500`)

  - Dark Surface (Deep Slate): `#0F172A` (Tailwind `slate-900` - Used for Cashier Scanner & Dark Mode UI)

  - Light Canvas (Crisp Snow): `#F8FAFC` (Tailwind `slate-50` - Used for Merchant & Admin Dashboard panels)

  - Card Surface (Pure White): `#FFFFFF`

---

### 3. Unified Single-Codebase Portal Architecture:

#### A. Super-Admin Portal (`/admin`)

- Restricted to users with `role == 'super_admin'` via Supabase RLS policies.

- **Multi-Tenant Account Management:** Create, view, update, suspend, or upgrade client restaurant accounts.

- **Platform Analytics:** Total active passes issued, total redemptions, and system health metrics across all tenant businesses.

- **Hardware Dispatch Tracker:** Log physical NFC counter stand and QR acrylic sign shipments assigned to specific merchant tenant IDs.

- **White-Label & Domain Manager:** Map custom client domains and configure platform branding options.

#### B. Merchant Client Portal (`/dashboard`)

- Restricted to users with `role == 'merchant'`.

- **Top Navigation:** Includes language switcher (Arabic <-> English) and quick business profile details.

- **Pass Designer with Live Dual Preview:**

  - Visual card editor allowing merchants to upload brand logos, set background/text colors, and define pass text in both Arabic and English.

  - Features real-time, side-by-side interactive preview mockups showing exactly how the card renders inside both Apple Wallet (`.pkpass`) and Google Wallet.

  - Includes auto-resizing for uploaded logos and auto-contrast calculation (switches text color to white on dark card backgrounds).

- **All 3 Program Types Supported:**

  1. *Digital Stamp Card:* Configurable target stamps (e.g., "Buy 9 Coffees, Get 1 Free").

  2. *Points & Cashback:* Configurable SAR-to-point ratios (e.g., "Earn 1 Point per 10 SAR spent").

  3. *Coupon-to-Loyalty Morph:* Starts as an introductory discount voucher (e.g., "20% Off First Visit") and automatically morphs into a permanent Loyalty Card upon its first scan.

- **Cashier PIN Security Manager:** Form to set, view, and change the 4-digit numeric PIN used by store staff to access the scanner terminal.

- **Geofence & Location Manager:** Store address map pin picker to save GPS latitude/longitude coordinates and write custom proximity alert text in Arabic and English (e.g., "أنت قريب من المقهى! تفضل بزيارتنا اليوم").

- **Broadcast Push Campaign Sender:** UI tool to trigger instant lock-screen push notifications to active cardholders via the WalletWallet API.

- **Automated Inactivity Reminders:** Set up automated push notifications triggered when a customer hasn't visited in 14, 30, or 60 days.

- **Analytics Dashboard:** Data charts showing pass installs, daily scanner redemptions, peak visit hours, and customer retention metrics.

#### C. Cashier Terminal PWA (`/scan`)

- Default theme: High-contrast Dark Mode (`#0F172A`).

- Protected by a simple 4-digit PIN lock screen matching the merchant's configured PIN.

- Built-in HTML5 camera scanner (`html5-qrcode`) to instantly scan customer pass QR codes.

- Touch-friendly cashier control panel:

  - `[ +1 Stamp ]`

  - `[ Log SAR Amount ]`

  - `[ Redeem Free Reward ]`

- Instantly updates Supabase `pass_instances` and triggers the WalletWallet API push endpoint to update the customer's phone wallet with a chime notification.

#### D. Customer Claim Page (`slug.yourplatform.com` or `/join/:slug`)

- Supports dynamic subdomains (`slug.yourplatform.com`) with a path fallback (`/join/:slug`).

- Automatically loads the business's logo, brand colors, and active loyalty campaign from Supabase based on the store `slug`.

- Mobile-optimized sign-up form capturing the customer's phone number.

- On form submission: Calls the Supabase Edge Function to create the pass via WalletWallet API and presents prominent "Add to Apple Wallet" and "Save to Google Wallet" download buttons.

---

### 4. Modular Template Storage:

- Create a central placeholder workspace file at `src/constants/defaultTemplates.ts` with typed JSON schemas for pass layouts (storing color tokens, field placements, Arabic/English string definitions, and barcode settings) so custom pass schemas generated in Claude can be pasted into the code easily.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/75b6169d-30a6-4b54-9231-862bf3e4bf5c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
