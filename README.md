# Snip frontend

Angular 21 LTS single-page client for the Snip URL shortener.
The user-approved upgrade from the tutorial's Angular 19 removes the release's
high/critical dependency findings without changing the UI or shared API.

## Run locally

Use Node 22.12+ (22.x) or Node 24.x. Start the backend on port `3000`, then run:

```sh
npm ci
npx ng serve
```

The development app calls `http://localhost:3000`. Production builds use
same-origin `/api` requests so the bundled UI can be served by the backend.

## Build

```sh
npx ng build
```

The build is written to `dist/snip-frontend/browser`.
