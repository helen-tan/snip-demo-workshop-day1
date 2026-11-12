# Snip CLI

A zero-dependency Node.js command-line client for the Snip URL shortener. Node.js 20 or newer is required.

```sh
node cli.js add https://example.com
node cli.js ls
node cli.js open abc123
node cli.js help
```

Set `SNIP_API` to the backend base URL to use a server other than `http://localhost:3000`.

The `snip`, `snip.cmd`, and `snip.ps1` wrappers forward their arguments to `cli.js`.
