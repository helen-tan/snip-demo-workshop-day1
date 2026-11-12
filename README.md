# Snip frontend

Angular 19 single-page client for the Snip URL shortener.

## Run locally

Start the backend on port `3000`, then run:

```sh
npm install
npx ng serve
```

The development app calls `http://localhost:3000`. Production builds use
same-origin `/api` requests so the bundled UI can be served by the backend.

## Build

```sh
npx ng build
```

The build is written to `dist/snip-frontend/browser`.
