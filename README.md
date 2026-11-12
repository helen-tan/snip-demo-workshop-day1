# Snip backend

A dependency-free Bun API for the Snip URL shortener. Links are stored in memory
and are cleared whenever the server restarts.

## Run

```sh
bun start
```

The server listens on port `3000` by default. Set `PORT` to change it, `BASE_URL`
to set the origin used in returned short URLs, or `RAILWAY_PUBLIC_DOMAIN` to use
the Railway domain when `BASE_URL` is unset. Set `PUBLIC_DIR` to serve static
files as well as the API.

## API

- `POST /api/links` with `{"url":"https://example.com"}` creates a link.
- `GET /api/links` returns all links.
- `GET /:code` redirects to the original URL and increments its hit count.
