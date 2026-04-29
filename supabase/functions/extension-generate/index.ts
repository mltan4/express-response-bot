// Public-CORS edge function for the Chrome extension.
// Validates the user's access token, then generates 3 reply variants and
// records to history (so style-learning continues to work).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRESETS: Record<string, string> = {
  professional: "Professional, clear, and respectful. Avoid slang. Use complete sentences.",
  casual: "Casual and friendly, like talking to a colleague. Contractions are fine.",
  witty: "Witty and a touch playful, but never sarcastic or unkind. Light humor where it fits.",
  warm: "Warm, empathetic, and supportive. Acknowledge feelings.",
  direct: "Direct and concise. Skip pleasantries. Get to the point.",
  enthusiastic: "Enthusiastic and energetic. Show genuine excitement.",
};

const PLATFORM_HINT =
  "LinkedIn — professional network. Keep it polished, brief, no excessive emojis.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // --- Auth: validate the user's token ---
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // --- Body ---
    const body = await req.json().catch(() => ({}));
    const {
      surface = "message", // "message" | "comment"
      conversation = "",   // raw extracted thread / post text
      authorName = "",
      tone = "casual",
      length = "medium",
      voiceProfileId = null,
    } = body as Record<string, unknown>;

    if (!conversation || typeof conversation !== "string") {
      return new Response(JSON.stringify({ error: "Missing conversation context" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Pull voice profile (optional) ---
    let voiceProfile: any = null;
    if (voiceProfileId && typeof voiceProfileId === "string") {
      const { data } = await supabase
        .from("voice_profiles")
        .select("id, preset, samples, custom_instructions")
        .eq("id", voiceProfileId)
        .maybeSingle();
      voiceProfile = data;
    } else {
      const { data } = await supabase
        .from("voice_profiles")
        .select("id, preset, samples, custom_instructions, is_default")
        .eq("is_default", true)
        .maybeSingle();
      voiceProfile = data;
    }

    // --- Pull learned style preferences ---
    const { data: history } = await supabase
      .from("reply_history")
      .select("variants, chosen_variant_index")
      .eq("user_id", userId)
      .not("chosen_variant_index", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    const counts: Record<string, number> = {};
    (history ?? []).forEach((row: any) => {
      const idx = row.chosen_variant_index;
      const label = row.variants?.[idx]?.label;
      if (label) counts[label] = (counts[label] || 0) + 1;
    });
    const stylePreferences = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([l]) => l)
      .slice(0, 3);

    const lengthGuide = length === "short" ? "1-2 sentences" : length === "long" ? "a full paragraph (5-8 sentences)" : "3-5 sentences";
    const toneGuide = PRESETS[tone as string] || PRESETS.casual;

    let voiceContext = "";
    if (voiceProfile) {
      if (voiceProfile.preset && PRESETS[voiceProfile.preset]) {
        voiceContext += `\nVoice preset: ${PRESETS[voiceProfile.preset]}`;
      }
      if (voiceProfile.samples?.length) {
        voiceContext += `\n\nThe user writes like this — match their voice (vocabulary, rhythm, punctuation):\n${voiceProfile.samples.slice(0, 5).map((s: string, i: number) => `Sample ${i + 1}: "${s}"`).join("\n")}`;
      }
      if (voiceProfile.custom_instructions) {
        voiceContext += `\n\nUser's rules: ${voiceProfile.custom_instructions}`;
      }
    }

    const styleBias = stylePreferences.length
      ? `\n\nLearned style preference: this user has historically picked variants labeled ${stylePreferences.map((s) => `"${s}"`).join(", ")}. Bias at least one variant toward those styles.`
      : "";

    const surfaceInstr = surface === "comment"
      ? `You are drafting a COMMENT on a LinkedIn post${authorName ? ` by ${authorName}` : ""}. Add value — react to a specific point, share a perspective, or ask a thoughtful question. No generic "Great post!". Don't @-mention.`
      : `You are drafting a REPLY in a LinkedIn DM thread${authorName ? ` with ${authorName}` : ""}. Read the thread and respond naturally to the latest message.`;

    const systemPrompt = `You are a LinkedIn ${surface === "comment" ? "comment" : "reply"} assistant. Generate exactly 3 distinct variants.

${surfaceInstr}

Platform context: ${PLATFORM_HINT}
Tone: ${toneGuide}
Length: each variant should be ${lengthGuide}.${voiceContext}${styleBias}

Rules:
- Output ONLY through the provided tool, never plain text.
- Make the 3 variants meaningfully different (different angle, opener, or structure).
- Never use clichés like "I hope this finds you well" or "circle back".
- Match the language of the source content.`;

    const userPrompt = surface === "comment"
      ? `Post${authorName ? ` by ${authorName}` : ""}:\n"""${conversation}"""`
      : `Conversation:\n"""${conversation}"""`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_replies",
            description: "Return 3 reply variants",
            parameters: {
              type: "object",
              properties: {
                variants: {
                  type: "array", minItems: 3, maxItems: 3,
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string", description: "Short descriptor like 'Direct', 'Warm', 'Curious'" },
                      text: { type: "string", description: "The reply text" },
                    },
                    required: ["label", "text"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["variants"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_replies" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No reply variants returned");
    const args = JSON.parse(toolCall.function.arguments);

    // Insert into history
    const { data: inserted } = await supabase.from("reply_history").insert({
      user_id: userId,
      platform: "linkedin",
      mode: surface === "comment" ? "extension+comment" : "extension+message",
      incoming_message: conversation.slice(0, 4000),
      intent: authorName ? `via extension · ${authorName}` : "via extension",
      tone, length,
      voice_profile_id: voiceProfile?.id ?? null,
      variants: args.variants,
    }).select("id").single();

    return new Response(JSON.stringify({ variants: args.variants, historyId: inserted?.id ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extension-generate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
