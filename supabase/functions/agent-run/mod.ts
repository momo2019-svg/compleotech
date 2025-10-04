import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(async (req) => {
  const input = await req.json().catch(() => ({}));
  return new Response(
    JSON.stringify({ ok: true, input, time: new Date().toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
});
