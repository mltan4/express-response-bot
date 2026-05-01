import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Download, Check, Chrome, ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// Set this to your published extension's ID once you've loaded it.
// While developing unpacked, leave it empty — the page will still let users
// install, then they hit "Sync session" again from inside the popup.
const EXTENSION_IDS: string[] = [
  // "your-published-extension-id-here",
];

type SyncState = "idle" | "syncing" | "success" | "not-installed" | "error";

export default function Install() {
  const { user, loading } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [manualId, setManualId] = useState("");

  useEffect(() => {
    // If they came here right after install, try syncing automatically once.
    if (user && EXTENSION_IDS.length > 0) {
      void syncSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth?redirect=/install" replace />;

  const downloadExtension = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/replykit-extension.zip");
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "replykit-extension.zip";
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Downloaded — now load it in Chrome (steps below).");
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const syncSession = async (overrideId?: string) => {
    setSyncState("syncing");
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setSyncState("error");
      toast.error("Couldn't read your session — try signing in again.");
      return;
    }
    const w = window as any;
    if (!w.chrome?.runtime?.sendMessage) {
      setSyncState("not-installed");
      return;
    }
    const ids = overrideId ? [overrideId] : (EXTENSION_IDS.length ? EXTENSION_IDS : []);
    if (ids.length === 0) {
      setSyncState("not-installed");
      toast.message("Paste your extension ID below, then sync.");
      return;
    }
    let success = false;
    let lastError = "";
    for (const id of ids) {
      try {
        await new Promise<void>((resolve, reject) => {
          w.chrome.runtime.sendMessage(
            id,
            { type: "RK_SET_TOKEN", token, email: user.email },
            (resp: any) => {
              const err = w.chrome.runtime.lastError;
              if (err) reject(new Error(err.message || "chrome.runtime error"));
              else if (resp?.ok) resolve();
              else reject(new Error("Extension didn't acknowledge"));
            },
          );
        });
        success = true;
        break;
      } catch (e: any) {
        lastError = e?.message || String(e);
        console.error("[ReplyKit sync] id", id, "->", lastError);
      }
    }
    if (success) {
      setSyncState("success");
      toast.success("Extension is signed in. You're ready to use it on LinkedIn.");
    } else {
      setSyncState("not-installed");
      if (lastError) toast.error(`Sync failed: ${lastError}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b border-border bg-card/60 backdrop-blur-sm">
        <div className="container flex items-center justify-between h-16 px-4">
          <Link to="/app" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-soft">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">ReplyKit</span>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/app"><ArrowLeft className="h-4 w-4 mr-1" /> Back to app</Link>
          </Button>
        </div>
      </header>

      <main className="container max-w-2xl px-4 py-8 md:py-12">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-medium mb-4">
            <Chrome className="h-3 w-3" /> Browser extension · Chrome, Edge, Brave, Arc
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">ReplyKit on LinkedIn, in one click</h1>
          <p className="text-muted-foreground mt-2">
            Skip the copy-paste. Generate replies and post comments right inside LinkedIn.
          </p>
        </div>

        <Card className="p-6 shadow-soft mb-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">1</div>
            <div className="flex-1">
              <h3 className="font-semibold">Download the extension</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-3">
                Grab the ZIP — we'll guide you through loading it.
              </p>
              <Button onClick={downloadExtension} disabled={downloading} className="gap-2">
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download ReplyKit (.zip)
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6 shadow-soft mb-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">2</div>
            <div className="flex-1">
              <h3 className="font-semibold">Load it in your browser</h3>
              <p className="text-xs text-muted-foreground mt-1">Works in Chrome, Microsoft Edge, Brave, Arc, and Opera.</p>
              <ol className="text-sm text-muted-foreground mt-2 space-y-1 list-decimal list-inside">
                <li>Unzip the file you just downloaded.</li>
                <li>
                  Open the extensions page in a new tab:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>Chrome / Brave / Arc / Opera: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">chrome://extensions</code></li>
                    <li>Microsoft Edge: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">edge://extensions</code></li>
                  </ul>
                </li>
                <li>Toggle <strong>Developer mode</strong> on (top-right in Chrome; left sidebar in Edge).</li>
                <li>Click <strong>Load unpacked</strong> and select the unzipped folder.</li>
                <li>Copy the <strong>Extension ID</strong> shown on the card and paste it below.</li>
              </ol>
            </div>
          </div>
        </Card>

        <Card className="p-6 shadow-soft mb-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold shrink-0">3</div>
            <div className="flex-1">
              <h3 className="font-semibold">Sign in to the extension</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-3">
                Paste your extension's ID, then click sync — we'll securely send your session to the extension.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value.trim())}
                  placeholder="e.g. abcdefghijklmnopabcdefghijklmnop"
                  className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm font-mono"
                />
                <Button
                  onClick={() => syncSession(manualId || undefined)}
                  disabled={syncState === "syncing" || (!manualId && EXTENSION_IDS.length === 0)}
                  className="gap-2"
                >
                  {syncState === "syncing" ? <Loader2 className="h-4 w-4 animate-spin" /> :
                   syncState === "success" ? <Check className="h-4 w-4" /> :
                   <Sparkles className="h-4 w-4" />}
                  {syncState === "success" ? "Synced" : "Sync session"}
                </Button>
              </div>
              {syncState === "success" && (
                <div className="mt-3 flex items-center gap-2 text-sm text-primary">
                  <Check className="h-4 w-4" /> Extension is signed in — head to LinkedIn and look for the ✨ button.
                </div>
              )}
              {syncState === "not-installed" && (
                <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Couldn't reach the extension. Common causes:
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      <li>Extension ID is wrong (copy it exactly from <code className="bg-muted px-1 rounded">chrome://extensions</code>)</li>
                      <li>You downloaded the ZIP <strong>before</strong> this fix — re-download and reload the unpacked folder</li>
                      <li>The extension is disabled in Chrome</li>
                    </ul>
                  </span>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-6 shadow-soft bg-accent/30">
          <h3 className="font-semibold mb-2">What you can do</h3>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            <li>• ✨ button in every <strong>LinkedIn DM</strong> composer</li>
            <li>• ✨ button on every <strong>post comment</strong> box</li>
            <li>• Uses your tone, length, voice profile, and learned style preferences</li>
            <li>• Picks are saved to your history so the AI keeps learning</li>
          </ul>
        </Card>
      </main>
    </div>
  );
}
