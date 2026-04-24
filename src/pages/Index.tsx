import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, MessageSquareReply, Mic2, Zap, ArrowRight, Linkedin, Mail, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-soft">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">Replyly</span>
          </Link>
          <nav className="flex items-center gap-3">
            {user ? (
              <Button asChild><Link to="/app">Open dashboard</Link></Button>
            ) : (
              <>
                <Button variant="ghost" asChild><Link to="/auth">Sign in</Link></Button>
                <Button asChild><Link to="/auth">Get started</Link></Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="container py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-medium mb-6">
          <Zap className="h-3 w-3" /> Reply faster, in your voice
        </div>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight max-w-3xl mx-auto leading-[1.05]">
          The reply generator for every inbox you have
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
          Paste any message from LinkedIn, X, email, or Slack — get three on-brand replies in seconds. Trained on how you actually write.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link to={user ? "/app" : "/auth"}>
              {user ? "Open dashboard" : "Try it free"} <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="mt-12 flex items-center justify-center gap-8 text-muted-foreground">
          <div className="flex items-center gap-2 text-sm"><Linkedin className="h-4 w-4" /> LinkedIn</div>
          <div className="flex items-center gap-2 text-sm"><MessageSquare className="h-4 w-4" /> X / Slack</div>
          <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4" /> Email</div>
        </div>
      </section>

      <section className="container pb-24 grid md:grid-cols-3 gap-6">
        {[
          { icon: MessageSquareReply, title: "Two modes", body: "Paste a single message for a quick reply, or a full thread when context matters." },
          { icon: Mic2, title: "Your voice", body: "Pick a preset persona or train it on samples of how you actually write." },
          { icon: Zap, title: "3 variants, every time", body: "Different angles to choose from — copy the one that fits, refine, send." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="p-6 rounded-xl bg-card border border-border shadow-soft">
            <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center mb-4">
              <Icon className="h-5 w-5 text-accent-foreground" />
            </div>
            <h3 className="font-semibold mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
};

export default Index;
