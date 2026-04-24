
-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Voice profiles
CREATE TABLE public.voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  preset TEXT,
  samples TEXT[] DEFAULT '{}',
  custom_instructions TEXT,
  default_platform TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own voice profiles" ON public.voice_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own voice profiles" ON public.voice_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own voice profiles" ON public.voice_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own voice profiles" ON public.voice_profiles FOR DELETE USING (auth.uid() = user_id);

-- Reply history
CREATE TABLE public.reply_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT,
  mode TEXT NOT NULL,
  incoming_message TEXT,
  intent TEXT,
  tone TEXT,
  length TEXT,
  voice_profile_id UUID REFERENCES public.voice_profiles(id) ON DELETE SET NULL,
  variants JSONB NOT NULL,
  chosen_variant_index INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reply_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own history" ON public.reply_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own history" ON public.reply_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own history" ON public.reply_history FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own history" ON public.reply_history FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER voice_profiles_updated_at BEFORE UPDATE ON public.voice_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE INDEX idx_voice_profiles_user ON public.voice_profiles(user_id);
CREATE INDEX idx_reply_history_user ON public.reply_history(user_id, created_at DESC);
