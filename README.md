# Snip

One Bun backend, two clients: an Angular 19 web app and a dependency-free Node CLI.
Links live in memory and disappear when the server restarts.

## Repository layout

Each component has independent history on an orphan branch of this repository.
Files live at that branch's root. `main` mounts exact commits as submodules:

| Branch/path | Purpose |
| --- | --- |
| `backend` | Bun 1.x server, zero npm dependencies |
| `frontend` | Angular 19 project `snip-frontend` |
| `cli` | Node 20+ CommonJS CLI and shell wrappers |
| `bundle` | Generated release: server, built UI, CLI, Docker configuration |
| `main` | Submodule pointers, build script, release workflows |

```sh
git clone --recurse-submodules https://github.com/helen-tan/snip-demo-workshop-day1.git
cd snip-demo-workshop-day1
```

Plain clones leave submodules empty. For an existing clone, run
`git submodule update --init --recursive`.

## Shared API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/api/links` | `{"url":"https://example.com"}` | 201 `{code,url,shortUrl,hits,createdAt}`; 400 `{error}` for invalid JSON/HTTP(S) URL |
| GET | `/api/links` | None | 200 array of link objects |
| GET | `/:code` | None | 302 Location and +1 hit; 404 if unknown |

Codes are six random base62 characters, initial hits are zero, and `createdAt` is
an ISO timestamp. CORS is open and OPTIONS preflight is supported.

## Development

Use separate terminals, with Bun 1.x and Node 20+ installed:

```sh
cd backend
bun start
```

```sh
cd frontend
npm ci
npm start
```

```sh
cd cli
node cli.js add https://example.com
node cli.js ls
```

Backend: `http://localhost:3000`; frontend: `http://localhost:4200`.
Development uses the localhost API; production uses same-origin `/api`.
`SNIP_API` overrides the CLI API origin.

The backend binds `0.0.0.0` and uses `PORT` (default 3000). `BASE_URL` controls
generated short links, falling back to `https://$RAILWAY_PUBLIC_DOMAIN`, then
localhost. `PUBLIC_DIR` enables static serving; `/` serves `index.html`, and
existing static files take precedence over short codes.

## Updating a component

Commit and push inside the submodule first, then commit its pointer on `main`:

```sh
cd backend
git switch backend
# edit, verify
git add -A
git commit -m "Update backend"
git push origin backend
cd ..
git submodule update --remote backend
git add backend
git commit -m "Bump backend submodule"
git push origin main
```

Only one contributor may switch branches in a shared checkout at a time.
Do not create ordinary folders at submodule mount paths.
Do not add `"type":"module"` beside `cli.js`.
The frontend output path `dist/snip-frontend/browser` is required for releases.
