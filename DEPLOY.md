# Deploy — GitHub + Cloudflare Pages

The app is a static site (Vite build → `dist/`). Cloudflare Pages watches the
GitHub repo and rebuilds + serves over HTTPS on every push. HTTPS = the camera
works on mobile.

## First time (once)

### 1. Create the GitHub repo

Go to <https://github.com/new>, create an empty repo (public or private both
work), e.g. `docscanner`. **Don't** add a README/.gitignore there — this repo
already has commits.

### 2. Push this repo to it

In the project folder:

```bash
git remote add origin https://github.com/<you>/docscanner.git
git push -u origin main
```

On Windows the first push pops a browser login (Git Credential Manager) — sign
in once and it's cached for future pushes.

### 3. Connect Cloudflare Pages

1. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages**
   → **Connect to Git**.
2. Pick the `docscanner` repo.
3. Build settings:
   - **Framework preset:** Vite (or None)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Environment variable:** `NODE_VERSION` = `20` (also set via `.node-version`)
4. **Save and Deploy.**

You get a URL like `https://docscanner.pages.dev`. Open it on your phone,
**Add to Home Screen** for an app-like experience.

## Every update after that

Cloudflare auto-rebuilds on every push to `main`. So updating = pushing:

```bash
git add -A
git commit -m "describe change"
git push
```

Wait ~1 min for the Pages build, refresh the phone. That's it.

> Once step 2's credentials are cached, I can run this commit+push for you in a
> future session when we make changes.

## Alternative: deploy via GitHub Actions

There is also a ready CI workflow at [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
that builds and runs `wrangler pages deploy` on every push. It needs two repo
**secrets** (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with the *Pages: Edit* permission.
- `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID.

And `--project-name` in the workflow must match the Cloudflare Pages project name.

> ⚠️ Use **one** path, not both. If the Cloudflare **Git integration** (above) is
> connected *and* this workflow has secrets, each push deploys twice (harmless but
> redundant). Today the project uses the Git integration; the workflow is a
> drop-in alternative if you prefer CI-driven deploys.

## Changing to a different GitHub / Cloudflare account

Nothing in the code is account-bound and no secrets live in the app, so moving is
just re-pointing the remote and host:

```bash
git remote set-url origin https://github.com/<new-account>/docscanner.git
git push -u origin main
```

Then either (a) connect the new Cloudflare account's Pages to the new repo
(build `npm run build`, output `dist`, `NODE_VERSION=20`), or (b) set the two
Actions secrets above in the new repo. **Users' scanned documents don't move**
— they live in each browser's IndexedDB; carry them with the in-app
**Backup / Restore** (JSON). Full checklist: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) §10.

## Reusing this for other projects

Same three steps: new GitHub repo → push → connect in Cloudflare Pages with
build `npm run build`, output `dist`, `NODE_VERSION=20`. Copy `wrangler.toml`
and `.node-version` into the new project.
