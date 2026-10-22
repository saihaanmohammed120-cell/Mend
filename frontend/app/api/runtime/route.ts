import { backendOrigin } from "@/lib/backend-proxy";
import { boundedReadiness, normalizeReadiness, UNAVAILABLE_RUNTIME } from "@/lib/runtime-readiness";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const response = await fetch(backendOrigin() + "/readyz", { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
    return Response.json(normalizeReadiness(await boundedReadiness(response), response.ok), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json(UNAVAILABLE_RUNTIME, { headers: { "Cache-Control": "no-store" } }); }
}
