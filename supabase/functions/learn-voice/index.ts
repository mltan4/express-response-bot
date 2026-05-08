// Nudge a user's voice profile based on the variant they picked vs the ones they didn't.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLIDER_KEYS = [
  "voice_warm_cool",
  "voice_formal_casual",
  "voice_soft_direct",
  "voice_energetic_calm",
  "voice_neutral_opinionated",
  "voice_brief_detailed",
  "voice_guarded_vulnerable",
  "voice_plain_technical",
] as const;

const HUMOR = ["none", "dry", "playful"];
const EMOJI = ["none", "minimal", "balanced", "expressive"];
const PUNCTUATION = ["lowercase", "sentence", "expressive"];
const STRUCTURE = ["balanced", "list-based", "story-first", "staccato", "stream of consciousness"];

function clamp(n: number, min = 0, max = 6) {
  return Math.max(min, Math.min(max, n));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { chosenText, otherTexts } = await req.json();
    if (!chosenText) throw new Error("chosenText required");

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile?.voice_auto_learn) {
      return new Response(JSON.stringify({ skipped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const current = Object.fromEntries(SLIDER_KEYS.map((k) => [k, profile?.[k] ?? 3]));

    const systemPrompt = `You analyze writing style. The user picked one message variant over others. Return SMALL nudges (-1, 0, or +1) for each style dial to gradually move toward how the user actually picked. Be conservative — most dials should be 0. Only nudge if the chosen variant clearly differs from the others on that dimension.

Each slider is 0..6. Lower = first label, Higher = second label:
- voice_warm_cool: 0=Warm, 6=Cool
- voice_formal_casual: 0=Formal, 6=Casual
- voice_soft_direct: 0=Soft, 6=Direct
- voice_energetic_calm: 0=Energetic, 6=Calm
- voice_neutral_opinionated: 0=Neutral, 6=Opinionated
- voice_brief_detailed: 0=Brief, 6=Detailed
- voice_guarded_vulnerable: 0=Guarded, 6=Vulnerable
- voice_plain_technical: 0=Plain, 6=Technical

Also detect categorical signals if (and only if) clearly evident in the chosen text:
- humor: none | dry | playful
- emoji: none | minimal | balanced | expressive
- punctuation: lowercase | sentence | expressive
- structure: balanced | list-based | story-first | staccato | stream of consciousness
For categoricals, return null if not clearly different from the others.`;

    const userPrompt = `Current dials: ${JSON.stringify(current)}

CHOSEN variant:
"""${chosenText}"""

NOT chosen:
${(otherTexts ?? []).map((t: string, i: number) => `Variant ${i + 1}: """${t}"""`).join("\n\n")}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_nudges",
            description: "Return small nudges to the user's voice profile.",
            parameters: {
              type: "object",
              properties: {
                deltas: {
                  type: "object",
                  properties: Object.fromEntries(SLIDER_KEYS.map((k) => [k, { type: "integer", minimum: -1, maximum: 1 }])),
                  required: [...SLIDER_KEYS],
                  additionalProperties: false,
                },
                humor: { type: ["string", "null"], enum: [...HUMOR, null] },
                emoji: { type: ["string", "null"], enum: [...EMOJI, null] },
                punctuation: { type: ["string", "null"], enum: [...PUNCTUATION, null] },
                structure: { type: ["string", "null"], enum: [...STRUCTURE, null] },
              },
              required: ["deltas", "humor", "emoji", "punctuation", "structure"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_nudges" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("learn-voice AI error", aiRes.status, t);
      return new Response(JSON.stringify({ error: "ai error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiRes.json();
    const args = JSON.parse(aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");

    const updates: Record<string, unknown> = {};
    for (const k of SLIDER_KEYS) {
      const delta = Number(args.deltas?.[k] ?? 0);
      updates[k] = clamp((current[k] as number) + (Number.isFinite(delta) ? delta : 0));
    }
    if (args.humor && HUMOR.includes(args.humor)) updates.voice_humor = args.humor;
    if (args.emoji && EMOJI.includes(args.emoji)) updates.voice_emoji = args.emoji;
    if (args.punctuation && PUNCTUATION.includes(args.punctuation)) updates.voice_punctuation = args.punctuation;
    if (args.structure && STRUCTURE.includes(args.structure)) updates.voice_structure = args.structure;

    await supabase.from("profiles").update(updates).eq("id", user.id);

    return new Response(JSON.stringify({ updated: updates }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("learn-voice error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
