// Generate 3 reply variants using Lovable AI
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRESETS: Record<string, string> = {
  conversational: "Conversational — natural, easygoing, like a real person talking. Contractions, light filler words ('honestly', 'tbh', 'fwiw') OK. Avoid corporate-speak and over-formality.",
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
    const { mode, platform, hasDraft, incomingMessage, intent, tone, length, voiceProfile, recipient, recipientLinkedinUrl, goal, context: outreachContext, draft, stylePreferences } = await req.json();
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

    const isOutreach = mode === "outreach";
    const kindNoun = isOutreach ? "outreach message" : "reply";
    const assistantRole = hasDraft
      ? `${isOutreach ? "cold outreach " : ""}message editing`
      : isOutreach ? "cold outreach" : "reply";

    const styleBias = Array.isArray(stylePreferences) && stylePreferences.length
      ? `\n\nLearned style preference: in past sessions, this user has most often picked variants labeled: ${stylePreferences.slice(0, 3).map((s: string) => `"${s}"`).join(", ")}. Bias AT LEAST ONE of the 3 variants toward these styles, but still keep the 3 meaningfully distinct.`
      : "";

    const systemPrompt = `You are a ${assistantRole} assistant. Generate exactly 3 distinct ${hasDraft ? `improved ${kindNoun}` : kindNoun} variants for the user.

Platform context: ${platformGuide}
Tone: ${toneGuide}
Length: each variant should be ${lengthGuide}.${voiceContext}${styleBias}

Rules:
- Output ONLY through the provided tool, never plain text.
- ${hasDraft
  ? "The 3 variants should be SUBTLE alternatives of the user's draft (e.g. one minimally edited, one slightly tightened, one with light reordering). Do NOT rewrite from scratch or change the angle/structure."
  : "Make the 3 variants meaningfully different (different angle, opener, or structure) — not minor wording tweaks."}
- Never use clichés like "I hope this email finds you well", "circle back", or "quick question" unless the user's voice samples use them.
${isOutreach
  ? `- This is a COLD message — the recipient does not know the sender. Lead with relevance or a specific hook, not generic flattery.
- Be specific. Reference the recipient or their context when provided.
- If a LinkedIn URL is provided, treat it as a signal that this is a LinkedIn outreach — keep tone aligned with that platform.
- End with a clear, low-friction call to action.
- Match the language the user wrote their goal/context in.`
  : `- Match the language of the incoming message.`}
${hasDraft
  ? `\nThe user has provided a DRAFT they wrote themselves. Your job is LIGHT-TOUCH editing — NOT rewriting:
- PRIMARY GOAL: fix typos, grammar mistakes, and awkward flow. That's it.
- Preserve the user's exact wording wherever it already works. Do not swap words for "better" synonyms.
- Keep the same sentence count, structure, and order as the draft unless something is broken.
- Do NOT add new sentences, ideas, greetings, sign-offs, or CTAs that aren't in the draft.
- Do NOT change the tone or "upgrade" the voice — match how the user already sounds.
- Preserve all facts, names, numbers, links, emojis, and punctuation style (including lowercase, fragments, etc.) as written.
- Use the surrounding context (recipient, goal, etc.) only to understand the draft — do not pull content from it into the output.
- Match the language of the original draft.
- If the draft is already clean, return it nearly verbatim across all 3 variants with only micro-differences.`
  : ""}`;

    let contextBlock: string;
    if (isOutreach) {
      const recipientBlock = [recipient, recipientLinkedinUrl ? `LinkedIn: ${recipientLinkedinUrl}` : ""].filter(Boolean).join("\n");
      contextBlock = `Who I'm reaching out to:\n${recipientBlock || "(not specified)"}\n\nWhat I want from this message (goal):\n${goal || "(not specified)"}\n\n${outreachContext ? `Background / context I can reference:\n${outreachContext}` : ""}`;
    } else if (mode === "thread") {
      contextBlock = `Conversation context:\n${incomingMessage || "(none provided)"}\n\nWhat I want to convey:\n${intent || "(not specified)"}`;
    } else {
      contextBlock = `Message I received:\n${incomingMessage || "(none provided)"}\n\n${intent ? `Additional intent: ${intent}` : ""}`;
    }

    const userPrompt = hasDraft
      ? `${contextBlock}\n\n---\n\nMy draft — rewrite this into 3 improved variants:\n"""${draft}"""`
      : contextBlock;

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
