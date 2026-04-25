import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Loader2, Star } from "lucide-react";
import { toast } from "sonner";

const PRESETS = [
  { id: "professional", label: "Professional" },
  { id: "casual", label: "Casual" },
  { id: "witty", label: "Witty" },
  { id: "warm", label: "Warm" },
  { id: "direct", label: "Direct" },
  { id: "enthusiastic", label: "Enthusiastic" },
];

type VP = {
  id: string;
  name: string;
  preset: string | null;
  samples: string[];
  custom_instructions: string | null;
  default_platform: string | null;
  is_default: boolean;
};

export default function Voice() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<VP[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<VP | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("voice_profiles").select("*").order("created_at", { ascending: false });
    setProfiles((data ?? []) as VP[]);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const startNew = () => {
    setEditing({
      id: "",
      name: "",
      preset: "professional",
      samples: [""],
      custom_instructions: "",
      default_platform: null,
      is_default: profiles.length === 0,
    });
  };

  const handleSave = async () => {
    if (!editing || !user) return;
    if (!editing.name.trim()) { toast.error("Give the profile a name"); return; }
    setSaving(true);
    const samples = editing.samples.map((s) => s.trim()).filter(Boolean);
    const payload = {
      user_id: user.id,
      name: editing.name.trim(),
      preset: editing.preset,
      samples,
      custom_instructions: editing.custom_instructions?.trim() || null,
      default_platform: editing.default_platform,
      is_default: editing.is_default,
    };
    let res;
    if (editing.id) {
      res = await supabase.from("voice_profiles").update(payload).eq("id", editing.id);
    } else {
      res = await supabase.from("voice_profiles").insert(payload);
    }
    if (editing.is_default) {
      await supabase.from("voice_profiles").update({ is_default: false }).neq("id", editing.id || "00000000-0000-0000-0000-000000000000");
      if (editing.id) await supabase.from("voice_profiles").update({ is_default: true }).eq("id", editing.id);
    }
    setSaving(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success("Voice profile saved");
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this voice profile?")) return;
    const { error } = await supabase.from("voice_profiles").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); load(); }
  };

  return (
    <div className="container max-w-4xl px-4 py-6 md:py-10">
      <div className="flex items-start md:items-center justify-between gap-3 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Voice profiles</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">Train the AI to write like you do.</p>
        </div>
        {!editing && <Button onClick={startNew} size="sm" className="gap-2 shrink-0"><Plus className="h-4 w-4" /> <span className="hidden sm:inline">New profile</span><span className="sm:hidden">New</span></Button>}
      </div>

      {editing && (
        <Card className="p-6 shadow-soft mb-6">
          <h2 className="font-semibold text-lg mb-4">{editing.id ? "Edit profile" : "New voice profile"}</h2>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="My LinkedIn voice" />
              </div>
              <div className="space-y-2">
                <Label>Base preset</Label>
                <Select value={editing.preset ?? ""} onValueChange={(v) => setEditing({ ...editing, preset: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sample messages you've written ({editing.samples.length})</Label>
              <p className="text-xs text-muted-foreground">Paste 3–5 messages you've actually sent. The AI will mirror your vocabulary and rhythm.</p>
              {editing.samples.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <Textarea
                    value={s}
                    onChange={(e) => {
                      const next = [...editing.samples];
                      next[i] = e.target.value;
                      setEditing({ ...editing, samples: next });
                    }}
                    placeholder={`Sample ${i + 1}…`}
                    className="min-h-[60px] resize-none"
                  />
                  <Button variant="ghost" size="icon" onClick={() => setEditing({ ...editing, samples: editing.samples.filter((_, idx) => idx !== i) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setEditing({ ...editing, samples: [...editing.samples, ""] })} className="gap-2">
                <Plus className="h-3.5 w-3.5" /> Add sample
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Custom rules (optional)</Label>
              <Textarea
                value={editing.custom_instructions ?? ""}
                onChange={(e) => setEditing({ ...editing, custom_instructions: e.target.value })}
                placeholder={`e.g. Never use "circle back". Always sign off with "Best, J".`}
                className="min-h-[80px] resize-none"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
              <div>
                <Label htmlFor="default-toggle">Make this my default</Label>
                <p className="text-xs text-muted-foreground">Selected automatically on the Generate page.</p>
              </div>
              <Switch
                id="default-toggle"
                checked={editing.is_default}
                onCheckedChange={(c) => setEditing({ ...editing, is_default: c })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save profile
              </Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : profiles.length === 0 && !editing ? (
        <Card className="p-12 text-center shadow-soft">
          <p className="text-muted-foreground mb-4">No voice profiles yet.</p>
          <Button onClick={startNew} className="gap-2"><Plus className="h-4 w-4" /> Create your first profile</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => (
            <Card key={p.id} className="p-4 shadow-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:shadow-elevated transition-shadow">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold truncate">{p.name}</h3>
                  {p.is_default && <span className="inline-flex items-center gap-1 text-xs text-primary"><Star className="h-3 w-3 fill-current" /> Default</span>}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {p.preset ? PRESETS.find((x) => x.id === p.preset)?.label : "Custom"} · {p.samples.length} samples
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => setEditing(p)}>Edit</Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
