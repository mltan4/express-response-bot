import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Loader2, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type VoiceSettings = {
  voice_warm_cool: number;
  voice_formal_casual: number;
  voice_soft_direct: number;
  voice_energetic_calm: number;
  voice_neutral_opinionated: number;
  voice_brief_detailed: number;
  voice_guarded_vulnerable: number;
  voice_plain_technical: number;
  voice_humor: string;
  voice_emoji: string;
  voice_punctuation: string;
  voice_structure: string;
  voice_auto_learn: boolean;
};

const DEFAULTS: VoiceSettings = {
  voice_warm_cool: 3,
  voice_formal_casual: 4,
  voice_soft_direct: 3,
  voice_energetic_calm: 3,
  voice_neutral_opinionated: 3,
  voice_brief_detailed: 3,
  voice_guarded_vulnerable: 3,
  voice_plain_technical: 2,
  voice_humor: "dry",
  voice_emoji: "minimal",
  voice_punctuation: "sentence",
  voice_structure: "balanced",
  voice_auto_learn: true,
};

const SLIDERS: { key: keyof VoiceSettings; left: string; right: string }[] = [
  { key: "voice_warm_cool", left: "Warm", right: "Cool" },
  { key: "voice_formal_casual", left: "Formal", right: "Casual" },
  { key: "voice_soft_direct", left: "Soft", right: "Direct" },
  { key: "voice_energetic_calm", left: "Energetic", right: "Calm" },
];

const VOICE_SLIDERS: { key: keyof VoiceSettings; left: string; right: string }[] = [
  { key: "voice_neutral_opinionated", left: "Neutral", right: "Opinionated" },
  { key: "voice_brief_detailed", left: "Brief", right: "Detailed" },
  { key: "voice_guarded_vulnerable", left: "Guarded", right: "Vulnerable" },
  { key: "voice_plain_technical", left: "Plain language", right: "Technical" },
];

const HUMOR = ["none", "dry", "playful"];
const EMOJI = ["none", "minimal", "balanced", "expressive"];
const PUNCTUATION = [
  { id: "lowercase", label: "lowercase" },
  { id: "sentence", label: "Sentence case" },
  { id: "expressive", label: "Expressive!" },
];
const STRUCTURE = ["balanced", "list-based", "story-first", "staccato", "stream of consciousness"];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors capitalize",
        active ? "bg-foreground text-background border-foreground" : "bg-background border-border hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) {
        setSettings({
          voice_warm_cool: data.voice_warm_cool ?? DEFAULTS.voice_warm_cool,
          voice_formal_casual: data.voice_formal_casual ?? DEFAULTS.voice_formal_casual,
          voice_soft_direct: data.voice_soft_direct ?? DEFAULTS.voice_soft_direct,
          voice_energetic_calm: data.voice_energetic_calm ?? DEFAULTS.voice_energetic_calm,
          voice_neutral_opinionated: data.voice_neutral_opinionated ?? DEFAULTS.voice_neutral_opinionated,
          voice_brief_detailed: data.voice_brief_detailed ?? DEFAULTS.voice_brief_detailed,
          voice_guarded_vulnerable: data.voice_guarded_vulnerable ?? DEFAULTS.voice_guarded_vulnerable,
          voice_plain_technical: data.voice_plain_technical ?? DEFAULTS.voice_plain_technical,
          voice_humor: data.voice_humor ?? DEFAULTS.voice_humor,
          voice_emoji: data.voice_emoji ?? DEFAULTS.voice_emoji,
          voice_punctuation: data.voice_punctuation ?? DEFAULTS.voice_punctuation,
          voice_structure: data.voice_structure ?? DEFAULTS.voice_structure,
          voice_auto_learn: data.voice_auto_learn ?? DEFAULTS.voice_auto_learn,
        });
      } else {
        await supabase.from("profiles").insert({ id: user.id, ...DEFAULTS });
      }
      setLoading(false);
    })();
  }, [user]);

  const update = <K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({ id: user.id, ...settings });
    setSaving(false);
    if (error) {
      toast.error("Couldn't save profile");
      return;
    }
    setSaved(true);
    toast.success("Profile saved");
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="container max-w-3xl px-4 py-10 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl px-4 py-6 md:py-10">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Your voice profile</h1>
        <p className="text-muted-foreground mt-1">
          Set the dials that shape every reply we generate. We'll keep tuning these as you pick favorites.
        </p>
      </div>

      <Card className="p-5 md:p-7 shadow-soft space-y-8">
        <section className="space-y-5">
          <h2 className="text-base font-semibold tracking-tight">Core Tone</h2>
          {SLIDERS.map(({ key, left, right }) => (
            <SliderRow key={key} value={settings[key] as number} onChange={(v) => update(key, v as never)} left={left} right={right} />
          ))}
        </section>

        <section className="space-y-5">
          <h2 className="text-base font-semibold tracking-tight">Voice Settings</h2>
          {VOICE_SLIDERS.map(({ key, left, right }) => (
            <SliderRow key={key} value={settings[key] as number} onChange={(v) => update(key, v as never)} left={left} right={right} />
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Humor</h2>
          <div className="flex flex-wrap gap-2">
            {HUMOR.map((h) => (
              <Chip key={h} active={settings.voice_humor === h} onClick={() => update("voice_humor", h)}>{h}</Chip>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Emoji Usage</h2>
          <div className="flex flex-wrap gap-2">
            {EMOJI.map((e) => (
              <Chip key={e} active={settings.voice_emoji === e} onClick={() => update("voice_emoji", e)}>{e}</Chip>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Punctuation</h2>
          <div className="flex flex-wrap gap-2">
            {PUNCTUATION.map((p) => (
              <Chip key={p.id} active={settings.voice_punctuation === p.id} onClick={() => update("voice_punctuation", p.id)}>{p.label}</Chip>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Structure</h2>
          <div className="flex flex-wrap gap-2">
            {STRUCTURE.map((s) => (
              <Chip key={s} active={settings.voice_structure === s} onClick={() => update("voice_structure", s)}>{s}</Chip>
            ))}
          </div>
        </section>

        <section className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <Sparkles className="h-4 w-4 mt-0.5 text-primary" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="auto-learn" className="text-sm font-medium">Auto-tune from my picks</Label>
              <Switch
                id="auto-learn"
                checked={settings.voice_auto_learn}
                onCheckedChange={(v) => update("voice_auto_learn", v)}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              When you pick a favorite among the 3 options, we nudge these dials slightly toward whatever you chose.
            </p>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? "Saved" : "Save profile"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function SliderRow({ value, onChange, left, right }: { value: number; onChange: (v: number) => void; left: string; right: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{left}</span>
        <span className="text-muted-foreground">{right}</span>
      </div>
      <Slider min={0} max={6} step={1} value={[value]} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}
