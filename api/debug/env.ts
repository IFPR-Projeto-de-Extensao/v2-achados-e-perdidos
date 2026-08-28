export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const isConfigured = Boolean(
    process.env.DISCORD_FEEDBACK_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL_FEEDBACK ||
    process.env.DISCORD_FEEDBACK_URL ||
    process.env.DISCORD_WEBHOOK_FEEDBACK ||
    process.env.DISCORD_SUPPORT_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK ||
    process.env.DISCORD_FEEDBACK
  );

  // Safe boolean flags only - NEVER expose secrets or URLs
  return res.status(200).json({
    status: isConfigured,
    DISCORD_FEEDBACK_WEBHOOK_URL: isConfigured,
    DISCORD_WEBHOOK_READY: isConfigured,
    runtime: typeof process !== "undefined" && process.release ? "node" : "serverless",
    timestamp: new Date().toISOString(),
  });
}
