import { randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const links = new Map();
const codeAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const port = Number(Bun.env.PORT || 3000);
const configuredBaseUrl = Bun.env.BASE_URL?.trim();
const railwayDomain = Bun.env.RAILWAY_PUBLIC_DOMAIN?.trim();
const publicDir = Bun.env.PUBLIC_DIR
  ? resolve(process.cwd(), Bun.env.PUBLIC_DIR)
  : null;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const domainBaseUrl = railwayDomain
  ? /^https?:\/\//i.test(railwayDomain)
    ? railwayDomain
    : `https://${railwayDomain}`
  : null;
const baseUrl = (configuredBaseUrl || domainBaseUrl || `http://localhost:${port}`)
  .replace(/\/+$/, "");

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders,
  });
}

function createCode() {
  let code = "";
  while (code.length < 6) {
    for (const byte of randomBytes(12)) {
      if (byte < 248) {
        code += codeAlphabet[byte % codeAlphabet.length];
        if (code.length === 6) break;
      }
    }
  }
  return code;
}

async function findStaticFile(pathname) {
  if (!publicDir) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = resolve(publicDir, `.${requestedPath}`);
  const relativePath = relative(publicDir, filePath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return null;
  }

  try {
    if (!(await stat(filePath)).isFile()) return null;
    return Bun.file(filePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

async function fetchHandler(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const { pathname } = new URL(request.url);

  if (request.method === "POST" && pathname === "/api/links") {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Request body must be valid JSON" }, 400);
    }

    if (typeof body?.url !== "string" || !body.url.trim()) {
      return jsonResponse({ error: "url must be a valid HTTP(S) URL" }, 400);
    }

    const url = body.url.trim();
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return jsonResponse({ error: "url must be a valid HTTP(S) URL" }, 400);
      }
    } catch {
      return jsonResponse({ error: "url must be a valid HTTP(S) URL" }, 400);
    }

    let code;
    do {
      code = createCode();
    } while (links.has(code));

    const link = {
      code,
      url,
      shortUrl: `${baseUrl}/${code}`,
      hits: 0,
      createdAt: new Date().toISOString(),
    };
    links.set(code, link);
    return jsonResponse(link, 201);
  }

  if (request.method === "GET" && pathname === "/api/links") {
    return jsonResponse(Array.from(links.values()));
  }

  if (request.method === "GET" || request.method === "HEAD") {
    const staticFile = await findStaticFile(pathname);
    if (staticFile) {
      return new Response(request.method === "HEAD" ? null : staticFile, {
        headers: {
          ...corsHeaders,
          "content-type": staticFile.type || "application/octet-stream",
        },
      });
    }
  }

  if (request.method === "GET" && /^\/[^/]+$/.test(pathname)) {
    let code;
    try {
      code = decodeURIComponent(pathname.slice(1));
    } catch {
      return jsonResponse({ error: "Link not found" }, 404);
    }

    const link = links.get(code);
    if (!link) return jsonResponse({ error: "Link not found" }, 404);

    link.hits += 1;
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        location: link.url,
      },
    });
  }

  return jsonResponse({ error: "Not found" }, 404);
}

Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch: fetchHandler,
});

console.log(`Snip backend listening on port ${port}`);
