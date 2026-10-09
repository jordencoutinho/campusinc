# CampusSync Noticeboard

A shared noticeboard: anyone with the link can pin, edit and remove notices, with optional flyer images.

## Files

| File | What it does |
|---|---|
| index.html | The page structure |
| style.css | How it looks (felt board, wood frame, pins) |
| script.js | How it works (saving, images, search, filters) |
| config.js | Your Supabase address and key. You edit this one |
| supabase-setup.sql | Creates the database and image storage |

## Step 1: Create the free database (Supabase)

1. Go to supabase.com and sign up (free).
2. Click **New project**, give it a name, set a database password (save it somewhere), pick the region closest to you, and create it. Wait a minute or two.
3. In the left menu open **SQL Editor** > **New query**. Open `supabase-setup.sql`, copy everything, paste it in, and press **Run**. You should see "Success".
4. Go to **Project Settings** > **API Keys** (or **API**). Copy:
   - the **Project URL**
   - the **anon** key (newer projects call it the **publishable** key)
   Never copy the "service_role" or "secret" key.
5. Open `config.js` in Notepad (or any text editor) and replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` with those two values. Keep the quotation marks. Save.

## Step 2: Put it online (Netlify, no GitHub needed)

1. Go to app.netlify.com/drop (sign up for free if asked).
2. Drag the whole `campussync-noticeboard` folder (with the edited config.js) onto the page.
3. Wait a few seconds. Netlify gives you a link such as `something-random.netlify.app`.
4. Open it, post a notice, and check it appears on your phone too.
5. To change the link name: Site configuration > Change site name.

## Step 3: Make it feel like an app (optional)

On a phone, open the link, then use the browser menu > **Add to Home Screen**.

## Updating later

Edit the files, then on Netlify open your site > **Deploys** and drag the folder in again.

## Things to know

- Anyone with the link can add, edit and delete notices. That was the brief, but it means someone could spam or wipe the board. Only share it with people you trust until we add logins and roles.
- Free plans have limits (storage, bandwidth, and Supabase may pause a project after a period of inactivity). Check each service's current limits. Fine for a class or department pilot.
- Don't put private student data in it.
