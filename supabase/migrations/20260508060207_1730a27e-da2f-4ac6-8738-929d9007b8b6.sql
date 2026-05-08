ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS voice_warm_cool smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS voice_formal_casual smallint NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS voice_soft_direct smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS voice_energetic_calm smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS voice_neutral_opinionated smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS voice_brief_detailed smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS voice_guarded_vulnerable smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS voice_plain_technical smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS voice_humor text NOT NULL DEFAULT 'dry',
  ADD COLUMN IF NOT EXISTS voice_emoji text NOT NULL DEFAULT 'minimal',
  ADD COLUMN IF NOT EXISTS voice_punctuation text NOT NULL DEFAULT 'sentence',
  ADD COLUMN IF NOT EXISTS voice_structure text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS voice_auto_learn boolean NOT NULL DEFAULT true;