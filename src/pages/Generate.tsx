import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Copy, Check, Loader2, Linkedin, Mail, MessageSquare, Twitter, Hash } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TONES = [
  { id: "professional", label: "Professional" },
  { id: "casual", label: "Casual" },
  { id: "witty", label: "Witty" },
  { id: "warm", label: "Warm" },
  { id: "direct", label: "Direct" },
  { id: "enthusiastic", label: "Enthusiastic" },
];

const LENGTHS = [
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Long" },
];

const PLATFORMS = [
  { id: "linkedin", label: "LinkedIn", icon: Linkedin },
  { id: "x", label: "X", icon: Twitter },
  { id: "email", label: "Email", icon: Mail },
  { id: "slack", label: "Slack", icon: Hash },
  { id: "imessage", label: "iMessage", icon: MessageSquare },
  { id: "other", label: "Other", icon: MessageSquare },
];

type Variant = { label: string; text: string };
type VoiceProfile = { id: string; name: string; preset: string | null; samples: string[]; custom_instructions: string | null; is_default: boolean };

export default function Generate() {
  const { user } = useAuth();
  const [mode, setMode] = useState<"quick" | "thread" | "outreach" | "fix">("outreach");
  const [platform, setPlatform] = useState("linkedin");
  const [incoming, setIncoming] = useState("");
  const [intent, setIntent] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientLinkedinUrl, setRecipientLinkedinUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [outreachContext, setOutreachContext] = useState("");
  const [draft, setDraft] = useState("");
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState("medium");
  const [voiceProfileId, setVoiceProfileId] = useState<string>("none");
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("voice_profiles").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      const list = (data ?? []) as VoiceProfile[];
      setVoiceProfiles(list);
      const def = list.find((v) => v.is_default);
      if (def) setVoiceProfileId(def.id);
    });
  }, [user]);

  const handleGenerate = async () => {
    if (mode === "quick" && !incoming.trim()) {
      toast.error("Paste the message you want to reply to.");
      return;
    }
    if (mode === "thread" && !intent.trim()) {
      toast.error("Describe what you want to convey.");
      return;
    }
    if (mode === "outreach" && !goal.trim()) {
      toast.error("Describe what you want from this outreach.");
      return;
    }
    if (mode === "fix" && !draft.trim()) {
      toast.error("Paste the draft you want to fix.");
      return;
    }

    setLoading(true);
    setVariants([]);
    try {
      const voiceProfile = voiceProfiles.find((v) => v.id === voiceProfileId) ?? null;
      const { data, error } = await supabase.functions.invoke("generate-reply", {
        body: {
          mode, platform,
          incomingMessage: incoming,
          intent,
          recipient,
          recipientLinkedinUrl,
          goal,
          context: outreachContext,
          draft,
          tone, length,
          voiceProfile,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setVariants(data.variants);

      const historyIncoming =
        mode === "outreach" ? (outreachContext || null)
        : mode === "fix" ? draft
        : (incoming || null);
      const historyIntent =
        mode === "outreach"
          ? `To: ${recipient || "—"}${recipientLinkedinUrl ? ` (${recipientLinkedinUrl})` : ""} · Goal: ${goal}`
          : (intent || null);

      await supabase.from("reply_history").insert({
        user_id: user!.id,
        platform, mode,
        incoming_message: historyIncoming,
        intent: historyIntent,
        tone, length,
        voice_profile_id: voiceProfile?.id ?? null,
        variants: data.variants,
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to generate replies");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedIdx(null), 1600);
  };

  return (
    <div className="container max-w-5xl py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {mode === "outreach" ? "Craft an outreach message" : "Generate a reply"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {mode === "outreach"
            ? "Tell us who you're reaching out to and what you want — get three variants."
            : "Paste a message, pick your tone, get three variants."}
        </p>
      </div>

      <Card className="p-6 shadow-soft">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "quick" | "thread" | "outreach")}>
            <TabsList>
              <TabsTrigger value="quick">Quick reply</TabsTrigger>
              <TabsTrigger value="thread">Thread + intent</TabsTrigger>
              <TabsTrigger value="outreach">Outreach</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2"><p.icon className="h-3.5 w-3.5" /> {p.label}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {mode === "outreach" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Who are you reaching out to?</Label>
              <Textarea
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="e.g. Jane Doe, Head of Design at Acme — we met briefly at Config last year"
                className="min-h-[80px] resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>What do you want from this message?</Label>
              <Textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Book a 20-min intro call to discuss a partnership"
                className="min-h-[80px] resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Background or hook (optional)</Label>
              <Textarea
                value={outreachContext}
                onChange={(e) => setOutreachContext(e.target.value)}
                placeholder="e.g. Loved their recent talk on design systems; we just shipped a similar product"
                className="min-h-[80px] resize-none"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{mode === "quick" ? "Message you received" : "Conversation context (optional)"}</Label>
              <Textarea
                value={incoming}
                onChange={(e) => setIncoming(e.target.value)}
                placeholder={mode === "quick" ? "Paste the LinkedIn message, email, DM…" : "Paste the thread for context…"}
                className="min-h-[120px] resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>{mode === "quick" ? "Anything to mention? (optional)" : "What do you want to convey?"}</Label>
              <Textarea
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder={mode === "quick" ? "e.g. Decline politely, suggest next month" : "e.g. Yes I'm interested, ask about timeline and budget"}
                className="min-h-[80px] resize-none"
              />
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tone</Label>
            <div className="flex flex-wrap gap-1.5">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTone(t.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    tone === t.id ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-secondary",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Length</Label>
            <div className="flex gap-1.5">
              {LENGTHS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLength(l.id)}
                  className={cn(
                    "flex-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    length === l.id ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-secondary",
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Voice profile</Label>
            <Select value={voiceProfileId} onValueChange={setVoiceProfileId}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No profile</SelectItem>
                {voiceProfiles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}{v.is_default ? " (default)" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleGenerate} disabled={loading} size="lg" className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Generating…" : mode === "outreach" ? "Generate 3 messages" : "Generate 3 replies"}
          </Button>
        </div>
      </Card>

      {variants.length > 0 && (
        <div className="mt-8 grid lg:grid-cols-3 gap-4">
          {variants.map((v, i) => (
            <Card key={i} className="p-5 shadow-soft hover:shadow-elevated transition-shadow flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent text-accent-foreground">{v.label}</span>
                <span className="text-xs text-muted-foreground">Option {i + 1}</span>
              </div>
              <p className="text-sm leading-relaxed flex-1 whitespace-pre-wrap">{v.text}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-2"
                onClick={() => handleCopy(v.text, i)}
              >
                {copiedIdx === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedIdx === i ? "Copied" : "Copy"}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
