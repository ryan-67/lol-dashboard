export const NUCKY_ORIGIN = "https://nucky.gg";

export function corsHeaders(origin?: string | null): HeadersInit {
  const allowOrigin = origin === NUCKY_ORIGIN ? origin : NUCKY_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}