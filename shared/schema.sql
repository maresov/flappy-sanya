-- Supabase schema for Game Hub
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)

-- Players table
CREATE TABLE players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nickname TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scores table
CREATE TABLE scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  game_slug TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast leaderboard queries
CREATE INDEX idx_scores_game_slug ON scores(game_slug);
CREATE INDEX idx_scores_player_id ON scores(player_id);
CREATE INDEX idx_scores_game_score ON scores(game_slug, score DESC);

-- Enable Row Level Security
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

-- RLS policies: anyone can read, anyone can insert (anon key)
-- Players
CREATE POLICY "Anyone can read players"
  ON players FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert players"
  ON players FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Players can update own record"
  ON players FOR UPDATE
  USING (true);

-- Scores
CREATE POLICY "Anyone can read scores"
  ON scores FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert scores"
  ON scores FOR INSERT
  WITH CHECK (true);

-- Leaderboard view: best score per player per game
CREATE OR REPLACE VIEW leaderboard AS
SELECT DISTINCT ON (s.game_slug, p.nickname)
  s.game_slug,
  p.nickname,
  s.score,
  s.created_at
FROM scores s
JOIN players p ON p.id = s.player_id
ORDER BY s.game_slug, p.nickname, s.score DESC;
