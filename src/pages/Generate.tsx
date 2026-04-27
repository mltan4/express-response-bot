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
import { Sparkles, Copy, Check, Loader2, Linkedin, Mail, MessageSquare, Twitter, Hash, ThumbsUp, TrendingUp } from "lucide-react";
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
  const [mode, setMode] = useState<"quick" | "thread" | "outreach">("outreach");
  const [hasDraft, setHasDraft] = useState(false);
  const [platform, setPlatform] = useState("slack");
  const [incoming, setIncoming] = useState("");
  const [intent, setIntent] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientLinkedinUrl, setRecipientLinkedinUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [outreachContext, setOutreachContext] = useState("");
  const [draft, setDraft] = useState("");
  const [tone, setTone] = useState("casual");
  const [length, setLength] = useState("medium");
  const [voiceProfileId, setVoiceProfileId] = useState<string>("none");
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const [savingChoice, setSavingChoice] = useState<number | null>(null);
  const [stylePreferences, setStylePreferences] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("voice_profiles").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      const list = (data ?? []) as VoiceProfile[];
      setVoiceProfiles(list);
      const def = list.find((v) => v.is_default);
      if (def) setVoiceProfileId(def.id);
    });
  }, [user]);

  // Learn the user's preferred styles from past picks
  const refreshStylePreferences = async () => {
    const { data } = await supabase
      .from("reply_history")
      .select("variants, chosen_variant_index")
      .not("chosen_variant_index", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    const counts: Record<string, number> = {};
    (data ?? []).forEach((row: any) => {
      const idx = row.chosen_variant_index;
      const label = row.variants?.[idx]?.label;
      if (label) counts[label] = (counts[label] || 0) + 1;
    });
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([l]) => l);
    setStylePreferences(ranked);
  };
  useEffect(() => { if (user) refreshStylePreferences(); }, [user]);

  const handleGenerate = async () => {
    if (hasDraft && !draft.trim()) {
      toast.error("Paste the draft you want to fix.");
      return;
    }
    if (!hasDraft) {
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
    }

    setLoading(true);
    setVariants([]);
    setHistoryId(null);
    setChosenIdx(null);
    try {
      const voiceProfile = voiceProfiles.find((v) => v.id === voiceProfileId) ?? null;
      const { data, error } = await supabase.functions.invoke("generate-reply", {
        body: {
          mode, platform,
          hasDraft,
          incomingMessage: incoming,
          intent,
          recipient,
          recipientLinkedinUrl,
          goal,
          context: outreachContext,
          draft,
          tone, length,
          voiceProfile,
          stylePreferences,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setVariants(data.variants);

      const historyIncoming =
        mode === "outreach" ? (outreachContext || null) : (incoming || null);
      const historyIntent =
        mode === "outreach"
          ? `${hasDraft ? "[fix draft] " : ""}To: ${recipient || "—"}${recipientLinkedinUrl ? ` (${recipientLinkedinUrl})` : ""} · Goal: ${goal || "—"}`
          : `${hasDraft ? "[fix draft] " : ""}${intent || ""}` || null;

      const { data: inserted } = await supabase.from("reply_history").insert({
        user_id: user!.id,
        platform, mode: hasDraft ? `${mode}+fix` : mode,
        incoming_message: historyIncoming,
        intent: historyIntent,
        tone, length,
        voice_profile_id: voiceProfile?.id ?? null,
        variants: data.variants,
      }).select("id").single();
      if (inserted?.id) setHistoryId(inserted.id);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate replies");
    } finally {
      setLoading(false);
    }
  };

  const handlePick = async (idx: number) => {
    if (!historyId) return;
    setSavingChoice(idx);
    const { error } = await supabase
      .from("reply_history")
      .update({ chosen_variant_index: idx })
      .eq("id", historyId);
    setSavingChoice(null);
    if (error) {
      toast.error("Couldn't save your pick");
      return;
    }
    setChosenIdx(idx);
    toast.success("Got it — learning from this pick");
    refreshStylePreferences();
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedIdx(null), 1600);
  };

  return (
    <div className="container max-w-5xl px-4 py-6 md:py-10">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          {mode === "outreach" ? "Craft an outreach message" : "Generate a reply"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {hasDraft
            ? "We'll rewrite your draft into 3 polished variants using the context below."
            : mode === "outreach"
            ? "Tell us who you're reaching out to and what you want — get three variants."
            : "Paste a message, pick your tone, get three variants."}
        </p>
        {stylePreferences.length > 0 && (
          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent text-accent-foreground text-xs font-medium">
            <TrendingUp className="h-3 w-3" />
            Learning your style: prefers {stylePreferences.slice(0, 3).join(", ")}
          </div>
        )}
      </div>

      <Card className="p-4 md:p-6 shadow-soft">
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3 md:gap-4 mb-6">
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="w-full md:w-auto">
            <TabsList className="w-full md:w-auto grid grid-cols-3 md:inline-flex">
              <TabsTrigger value="outreach">Outreach</TabsTrigger>
              <TabsTrigger value="quick">Quick reply</TabsTrigger>
              <TabsTrigger value="thread" className="whitespace-nowrap">Thread</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="hidden md:block flex-1" />
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="flex-1 md:w-[150px]"><SelectValue /></SelectTrigger>
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
              <Label className="flex items-center gap-2">
                <Linkedin className="h-3.5 w-3.5" /> Their LinkedIn URL (optional)
              </Label>
              <Input
                type="url"
                value={recipientLinkedinUrl}
                onChange={(e) => setRecipientLinkedinUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/janedoe"
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

        {/* Fix-a-draft section, available in every mode */}
        <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={hasDraft}
              onChange={(e) => setHasDraft(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-input accent-primary"
            />
            <div className="flex-1">
              <div className="text-sm font-medium">I already have a draft — fix it</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                We'll rewrite your draft into 3 improved variants, using the {mode === "outreach" ? "recipient and goal" : "context"} above as background.
              </div>
            </div>
          </label>
          {hasDraft && (
            <div className="mt-3">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste your draft here…"
                className="min-h-[140px] resize-none bg-background"
              />
            </div>
          )}
        </div>

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

        <div className="mt-6 flex justify-stretch md:justify-end">
          <Button onClick={handleGenerate} disabled={loading} size="lg" className="gap-2 w-full md:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Generating…" : hasDraft ? "Rewrite 3 versions" : mode === "outreach" ? "Generate 3 messages" : "Generate 3 replies"}
          </Button>
        </div>
      </Card>

      {variants.length > 0 && (
        <div className="mt-6 md:mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {variants.map((v, i) => (
            <Card
              key={i}
              className={cn(
                "p-5 shadow-soft hover:shadow-elevated transition-all flex flex-col",
                chosenIdx === i && "ring-2 ring-primary shadow-elevated",
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent text-accent-foreground">{v.label}</span>
                <span className="text-xs text-muted-foreground">Option {i + 1}</span>
              </div>
              <p className="text-sm leading-relaxed flex-1 whitespace-pre-wrap">{v.text}</p>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => handleCopy(v.text, i)}
                >
                  {copiedIdx === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedIdx === i ? "Copied" : "Copy"}
                </Button>
                <Button
                  variant={chosenIdx === i ? "default" : "secondary"}
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => handlePick(i)}
                  disabled={savingChoice !== null || !historyId}
                >
                  {savingChoice === i ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : chosenIdx === i ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <ThumbsUp className="h-3.5 w-3.5" />
                  )}
                  {chosenIdx === i ? "Picked" : "Use this"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
