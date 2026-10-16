import app from "../server";
import { applySecurityHeaders } from "./_lib/securityHeaders";

function sanitizeLogDetail(value: any): any {
  if (!value) return value;
  const str = typeof value === "string" ? value : String(value);
  return str
    .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, "[REDACTED_EMAIL]")
    .replace(/key=[a-zA-Z0-9_-]+/gi, "key=[REDACTED]")
    .replace(/token=[a-zA-Z0-9._-]+/gi, "token=[REDACTED]");
}

export default async function handler(req: any, res: any) {
  // 1. Recover the true original request URL
  // Under Vercel rewrites, the original requested path is available across query parameters or headers
  const headerUrl =
    req.headers?.["x-matched-path"] ||
    req.headers?.["x-vercel-matched-path"] ||
    req.headers?.["x-vercel-original-url"] ||
    req.headers?.["x-forwarded-uri"] ||
    req.headers?.["x-original-url"] ||
    req.headers?.["x-real-path"];

  let targetUrl = req.url || "/";

  // Check if rewrite passed ?__route= or &__route=
  if (req.url && req.url.includes("__route=")) {
    try {
      const parsedUrl = new URL(req.url, "http://localhost");
      const routeParam = parsedUrl.searchParams.get("__route");
      if (routeParam) {
        parsedUrl.searchParams.delete("__route");
        const remainingQuery = parsedUrl.searchParams.toString();
        targetUrl = `/api/${routeParam.replace(/^\/+/, "")}${remainingQuery ? `?${remainingQuery}` : ""}`;
      }
    } catch {
      const match = req.url.match(/[?&]__route=([^&]+)/);
      if (match) {
        const routePath = decodeURIComponent(match[1]).replace(/^\/+/, "");
        targetUrl = `/api/${routePath}`;
      }
    }
  } else if (
    headerUrl &&
    typeof headerUrl === "string" &&
    headerUrl !== "/api" &&
    headerUrl !== "/api/" &&
    (req.url === "/api" || req.url === "/api/" || req.url === "" || req.url === "/")
  ) {
    targetUrl = headerUrl;
  }

  // Ensure targetUrl starts with /
  if (!targetUrl.startsWith("/")) {
    targetUrl = "/" + targetUrl;
  }

  req.url = targetUrl;

  console.log(`[Vercel Serverless Invocation] ${req.method} ${req.url} [normalized from raw: ${req.headers?.["x-matched-path"] || "none"}]`);

  // 2. Execute Express app and reliably resolve when response completes
  return new Promise<void>((resolve) => {
    let settled = false;
    const safeResolve = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    // If the response was already ended synchronously
    if (res.writableEnded || res.finished) {
      return safeResolve();
    }

    // Crucial: Node.js / Vercel Serverless event lifecycle
    // In Express, when a route handles the request and calls res.json()/res.end(),
    // the callback passed to app(req, res, callback) is NOT called!
    // Therefore, listening to 'finish' and 'close' is mandatory to prevent FUNCTION_INVOCATION_FAILED timeouts.
    res.once("finish", safeResolve);
    res.once("close", safeResolve);

    try {
      app(req, res, (err: any) => {
        if (err) {
          console.error("[Vercel Serverless Express Error]:", {
            error: sanitizeLogDetail(err?.message || String(err)),
            name: err?.name,
            method: req.method,
            url: req.url,
          });
          if (!res.headersSent) {
            applySecurityHeaders(res);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                success: false,
                error: "Erro interno no servidor ao processar requisição.",
                code: "INTERNAL_SERVER_ERROR",
              })
            );
          }
        } else if (!res.headersSent) {
          // If Express reached the end of the router without sending a response (404)
          applySecurityHeaders(res);
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              success: false,
              error: `Rota não encontrada: ${req.method} ${req.url}`,
            })
          );
        }
        safeResolve();
      });
    } catch (handlerErr: any) {
      console.error("[Vercel Serverless Fatal Invocation Error]:", {
        error: sanitizeLogDetail(handlerErr?.message || String(handlerErr)),
        name: handlerErr?.name,
      });
      if (!res.headersSent) {
        applySecurityHeaders(res);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            error: "Erro interno no servidor ao processar requisição.",
            code: "INTERNAL_SERVER_ERROR",
          })
        );
      }
      safeResolve();
    }
  });
}


