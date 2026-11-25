# Turn on cloud sync (Sign in with Google)

Hisaab works fully offline on one device with no setup. Do these steps once if you want to sign in
with Google and see the same notes, money and plans on your phone and your laptop.

It takes about 20 minutes and is free. You'll create two things:

- a **Supabase** project (the cloud copy of your data), and
- a **Google sign-in client** (so the "Sign in with Google" button works).

Keep a notepad open: you'll copy a few values from one website to another.

---

## 1. Create a free Supabase project

1. Go to <https://supabase.com> and sign up (you can use your Google account).
2. Click **New project**. Pick any name (for example `hisaab`), set a database password (save it
   somewhere safe; Hisaab doesn't need it) and choose the region nearest to you (for example Mumbai).
3. Wait a minute or two while the project is created.
4. Open **Project Settings → API** (in newer dashboards it's **Project Settings → Data API** and
   **API Keys**). Copy and save these two values:
   - **Project URL**, which looks like `https://abcdefgh.supabase.co`
   - **anon public** key, a long text starting with `eyJ…`

   Do **not** copy the `service_role` key. It must never go in the app.

## 2. Create the tables

1. In Supabase, open **SQL Editor → New query**.
2. Open the file `supabase/schema.sql` from this project, copy everything in it and paste it into
   the editor.
3. Click **Run**. You should see "Success. No rows returned".

This creates three tables (`cards`, `versions`, `settings`) and turns on **Row Level Security**,
so each signed-in person can only ever see and change their own rows.

## 3. Create the Google sign-in client

1. Go to <https://console.cloud.google.com> and create a project (any name, for example `Hisaab`).
2. Open **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name
   (`Hisaab`), your email as the support and developer contact, and save. Under **Test users**, add
   your own Gmail address. (While the app is in "Testing" mode only listed test users can sign in,
   which is fine for a one-person app.)
3. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - **Authorised JavaScript origins**: add
     - `https://duckme-woad.vercel.app`
     - `http://localhost:5191`
   - **Authorised redirect URIs**: add
     `https://<your-project>.supabase.co/auth/v1/callback`
     (use your own Project URL from step 1, followed by `/auth/v1/callback`).
4. Click **Create**. Copy the **Client ID** and **Client secret**.

## 4. Switch on Google in Supabase

1. In Supabase, open **Authentication → Sign In / Providers** (older dashboards: **Providers**),
   then **Google**.
2. Turn it **on**, paste the **Client ID** and **Client secret** from step 3, and **Save**.
3. Open **Authentication → URL Configuration**:
   - **Site URL**: `https://duckme-woad.vercel.app`
   - **Redirect URLs**: add both
     - `https://duckme-woad.vercel.app/**`
     - `http://localhost:5191/**`
4. Save.

## 5. Give the app your keys

### On Vercel (the live app)

1. Open <https://vercel.com>, then your project, then **Settings → Environment Variables**.
2. Add two variables (tick Production, Preview and Development):
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
3. Go to **Deployments**, open the menu on the latest one and click **Redeploy**. The keys are read
   when the app is built, so the redeploy is needed.

### On your computer (optional, for running the app locally)

1. In the project folder, copy `.env.example` to a new file called `.env.local`.
2. Fill in the two values and save. Restart `npm run dev` if it was running.
   (`.env.local` is ignored by git, so it won't be committed.)

## 6. Sign in

Open the app, go to **More**. At the top you'll see **Account & sync**. Tap **Sign in with Google**,
pick your account, and you'll come back to More with "Syncing…" and then "Synced just now".
Do the same on your other devices.

On the first sign-in, whatever is already on the device is merged with what's in the cloud. Nothing
is wiped on either side. When the same item was edited in two places, the newest edit wins.

---

## Is it safe to put the anon key in the app?

Yes. The anon key is meant to be public: it only identifies your Supabase project. It does **not**
give access to data. Every table has Row Level Security, so the database only returns rows whose
owner is the person currently signed in with Google. Someone with the anon key but without your
Google sign-in sees nothing.

Never put the **service_role** key anywhere in the app or in Vercel's `VITE_…` variables. That key
skips Row Level Security.

## Good to know

- **Offline:** the app always works from the copy on your device. Changes made offline go up
  automatically when you're back online.
- **When does it sync?** When the app opens, every minute while it's on screen, when you come back
  to it, when you go back online, and about 2 seconds after you change something. You can also tap
  **Sync now**.
- **Sign out** asks whether to keep the data on this device. "Remove local copy" first makes sure
  everything is saved in the cloud, then clears this device.
- **The PIN for locked notes** syncs too, so the same PIN works on all devices. It's never included
  in exports.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| "Cloud sync isn't set up yet" | The two `VITE_SUPABASE_…` variables are missing. Add them in Vercel and **redeploy** (step 5). |
| Google says "redirect_uri_mismatch" | The redirect URI in Google (step 3) must be exactly `https://<your-project>.supabase.co/auth/v1/callback`. |
| After Google you land on the wrong site, or sign-in doesn't stick | Check Site URL and Redirect URLs in Supabase (step 4). |
| "Access blocked: app has not completed verification" | Add your Gmail under **Test users** on the OAuth consent screen (step 3). |
| "The cloud tables aren't set up" | Run `supabase/schema.sql` in the SQL Editor (step 2). |
| "Your sign-in expired" | Tap Sign out (keep data), then sign in again. |
