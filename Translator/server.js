const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const root = __dirname;
const defaultEndpoint = "https://api.cognitive.microsofttranslator.com";

loadLocalEnv();

const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ready: Boolean(process.env.AZURE_TRANSLATOR_KEY),
        provider: "Microsoft Translator"
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/translate") {
      await handleTranslate(request, response);
      return;
    }

    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Unexpected server error." });
  }
});

server.listen(port, () => {
  console.log(`Translator running at http://localhost:${port}`);
});

async function handleTranslate(request, response) {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  const endpoint = trimTrailingSlash(process.env.AZURE_TRANSLATOR_ENDPOINT || defaultEndpoint);

  if (!key) {
    sendJson(response, 500, {
      error: "Missing AZURE_TRANSLATOR_KEY. Add it to .env or set it in your shell."
    });
    return;
  }

  const body = await readJsonBody(request, 12000);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const from = typeof body.from === "string" ? body.from : "auto";
  const to = typeof body.to === "string" ? body.to : "";

  if (!text) {
    sendJson(response, 400, { error: "Text is required." });
    return;
  }

  if (!to || to === "auto") {
    sendJson(response, 400, { error: "Target language is required." });
    return;
  }

  const params = new URLSearchParams({
    "api-version": "3.0",
    to,
    textType: "plain"
  });

  if (from && from !== "auto") {
    params.set("from", from);
  }

  const translateResponse = await fetch(`${endpoint}/translate?${params.toString()}`, {
    method: "POST",
    headers: buildTranslatorHeaders(key, region),
    body: JSON.stringify([{ Text: text }])
  });

  const payloadText = await translateResponse.text();
  const payload = parseJson(payloadText);

  if (!translateResponse.ok) {
    sendJson(response, translateResponse.status, {
      error: payload?.error?.message || payloadText || "Translator API request failed."
    });
    return;
  }

  const firstResult = Array.isArray(payload) ? payload[0] : null;
  const translation = firstResult?.translations?.[0]?.text;

  if (!translation) {
    sendJson(response, 502, { error: "Translator API returned an unexpected response." });
    return;
  }

  sendJson(response, 200, {
    translatedText: translation,
    detectedLanguage: firstResult?.detectedLanguage?.language || null
  });
}

function buildTranslatorHeaders(key, region) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Ocp-Apim-Subscription-Key": key,
    "X-ClientTraceId": crypto.randomUUID()
  };

  if (region) {
    headers["Ocp-Apim-Subscription-Region"] = region;
  }

  return headers;
}

function readJsonBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw) > maxBytes) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON request body."));
      }
    });

    request.on("error", reject);
  });
}

async function serveStatic(urlPath, response) {
  const publicFiles = new Set(["/index.html", "/styles.css", "/app.js"]);
  const requestPath = urlPath === "/" ? "/index.html" : urlPath;

  if (!publicFiles.has(requestPath)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  const filePath = path.join(root, requestPath.slice(1));
  const content = await fsp.readFile(filePath);
  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  response.end(content);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function loadLocalEnv() {
  const envPath = path.join(root, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [name, ...valueParts] = trimmed.split("=");
    const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");

    if (!process.env[name]) {
      process.env[name] = value;
    }
  }
}
