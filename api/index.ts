import app from "../server.ts";

export default async function handler(req: any, res: any) {
  // Normalize URL when rewritten by Vercel
  // Vercel's rewrite rule `{ "source": "/api/(.*)", "destination": "/api" }` rewrites req.url to `/api`.
  // The original URL requested by the browser is in `x-matched-path` or `x-vercel-matched-path` or `req.headers["x-matched-path"]`.
  const originalUrl =
    req.headers?.["x-matched-path"] ||
    req.headers?.["x-vercel-matched-path"] ||
    req.headers?.["x-vercel-original-url"] ||
    req.headers?.["x-forwarded-uri"] ||
    req.headers?.["x-original-url"];

  if (originalUrl && typeof originalUrl === "string" && (req.url === "/api" || req.url === "/api/")) {
    req.url = originalUrl;
  }

  return new Promise<void>((resolve) => {
    try {
      app(req, res, (err: any) => {
        if (err) {
          console.error("[Vercel Serverless Express Error]:", err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                success: false,
                error: "Erro interno no servidor: " + (err?.message || String(err)),
              })
            );
          }
        }
        resolve();
      });
    } catch (handlerErr: any) {
      console.error("[Vercel Serverless Fatal Invocation Error]:", handlerErr);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            error: "Erro fatal na execução da função serverless: " + (handlerErr?.message || String(handlerErr)),
          })
        );
      }
      resolve();
    }
  });
}


