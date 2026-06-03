const ALLOWED_ORIGINS = new Set([
  "https://nucky.gg",
  "https://www.nucky.gg",
  "http://localhost:5173",
]);

export function corsHeaders(origin?: string | null): HeadersInit {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://nucky.gg";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}