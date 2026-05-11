# which gummi duck are you?

a real-time poll where the audience votes on a 9-duck mood spectrum from their phones, and the host screen shows a physics-driven "pond" of bubbles that grow with every vote.

## quick start (local)

just open `index.html` in a browser.

- default URL → **host view** (pond + QR code) — this is the public site
- `?vote` → **voter view** (3×3 grid of duck buttons) — what phones get from the QR

without firebase configured, the app runs in **local demo mode** using `BroadcastChannel`. Votes sync between tabs/windows on the same device — enough to test the host + voter views side by side.

## going live (cross-device real-time)

1. Create a Firebase project: <https://console.firebase.google.com/>
2. Build → **Realtime Database** → Create database → start in test mode.
3. Project settings → Your apps → register a web app, copy the `firebaseConfig`.
4. Paste it into `firebase-config.js`, replacing the `PASTE_ME` placeholders.
5. Reload. Status dot should turn green.

## hosting on GitHub Pages

```bash
cd "gummi-duck"
git init
git add .
git commit -m "init gummi duck poll"
gh repo create gummi-duck --public --source=. --push
gh repo edit --enable-pages --pages-branch main
```

Or via the GitHub UI:

1. New public repo, push the contents of this folder.
2. Settings → Pages → Source: `main` branch, `/ (root)` → Save.
3. Wait ~1 minute, your URL will be `https://<you>.github.io/gummi-duck/`.
4. Big screen URL (with QR + pond): `…/gummi-duck/`
   Voter URL (what the QR encodes): `…/gummi-duck/?vote`

> Firebase rules: for a closed event, keep the DB in test mode for the day and lock it down after. For longer-lived use, add rules that only allow incrementing `polls/current/votes/{1..9}`.

## tweaking the look

- `style.css` → `:root` block holds the palette (cream, yolk, mustard, cocoa).
- `--grid-top` / `--grid-bot` crop the 3×3 grid out of `ducks.png`. If your screenshot has a different header band, nudge these.
- duck button rotations live in `.duck-btn:nth-child(odd|even)`.

## files

- `index.html` — both views in one page, routed by `?host`
- `style.css`  — lo-fi yellow theme
- `app.js`     — voter grid, host pond (Matter.js + Canvas), sync layer
- `firebase-config.js` — paste your Firebase web app config here
- `ducks.png`  — the source 3×3 grid image
