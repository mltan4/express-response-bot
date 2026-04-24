// Generate 3 reply variants using Lovable AI
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRESETS: Record<string, string> = {
  professional: "Professional, clear, and respectful. Avoid slang. Use complete sentences.",
  casual: "Casual and friendly, like talking to a colleague. Contractions are fine.",
  witty: "Witty and a touch playful, but never sarcastic or unkind. Light humor where it fits.",
  warm: "Warm, empathetic, and supportive. Acknowledge feelings.",
  direct: "Direct and concise. Skip pleasantries. Get to the point.",
  enthusiastic: "Enthusiastic and energetic. Show genuine excitement.",
};

const PLATFORM_HINTS: Record<string, string> = {
  linkedin: "LinkedIn — professional network. Keep it polished, brief, no excessive emojis.",
  x: "X / Twitter — punchy, under 280 chars per reply, conversational.",
  email: "Email — proper greeting and sign-off optional based on length, full sentences.",
  slack: "Slack — informal, terse, emojis OK, can use short fragments.",
  imessage: "iMessage / SMS — very short, casual, lowercase OK.",
  other: "General messaging — adapt naturally.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, platform, incomingMessage, intent, tone, length, voiceProfile } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const lengthGuide = length === "short" ? "1-2 sentences" : length === "medium" ? "3-5 sentences" : "a full paragraph (5-8 sentences)";
    const toneGuide = PRESETS[tone] || PRESETS.professional;
    const platformGuide = PLATFORM_HINTS[platform] || PLATFORM_HINTS.other;

    let voiceContext = "";
    if (voiceProfile) {
      if (voiceProfile.preset && PRESETS[voiceProfile.preset]) {
        voiceContext += `\nVoice preset: ${PRESETS[voiceProfile.preset]}`;
      }
      if (voiceProfile.samples?.length) {
        voiceContext += `\n\nThe user writes like this — match their voice (vocabulary, rhythm, punctuation habits):\n${voiceProfile.samples.slice(0, 5).map((s: string, i: number) => `Sample ${i + 1}: "${s}"`).join("\n")}`;
      }
      if (voiceProfile.custom_instructions) {
        voiceContext += `\n\nUser's rules: ${voiceProfile.custom_instructions}`;
      }
    }

    const systemPrompt = `You are a reply assistant. Generate exactly 3 distinct reply variants for the user.

Platform context: ${platformGuide}
Tone: ${toneGuide}
Length: each reply should be ${lengthGuide}.${voiceContext}

Rules:
- Output ONLY through the provided tool, never plain text.
- Make the 3 variants meaningfully different (different angle, opener, or structure) — not minor wording tweaks.
- Never use clichés like "I hope this email finds you well" or "circle back" unless the user's voice samples use them.
- Match the language of the incoming message.`;

    const userPrompt = mode === "thread"
      ? `Conversation context:\n${incomingMessage || "(none provided)"}\n\nWhat I want to convey:\n${intent}`
      : `Message I received:\n${incomingMessage}\n\n${intent ? `Additional intent: ${intent}` : "Generate natural replies."}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                  type: "array",
                  minItems: 3,
                  maxItems: 3,
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

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No reply variants returned");
    const args = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ variants: args.variants }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-reply error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
