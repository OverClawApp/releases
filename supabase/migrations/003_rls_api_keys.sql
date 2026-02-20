ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own API keys" ON user_api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own API keys" ON user_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys" ON user_api_keys
  FOR DELETE USING (auth.uid() = user_id);
