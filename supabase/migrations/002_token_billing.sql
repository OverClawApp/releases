-- Token balance for each user
CREATE TABLE IF NOT EXISTS token_balances (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 0,
  total_purchased BIGINT NOT NULL DEFAULT 0,
  total_used BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create balance row on user signup
CREATE OR REPLACE FUNCTION create_token_balance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO token_balances (user_id, balance) VALUES (NEW.id, 4000)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created_balance ON auth.users;
CREATE TRIGGER on_auth_user_created_balance
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_token_balance();

-- Give existing users 1000 free tokens
INSERT INTO token_balances (user_id, balance, total_purchased)
SELECT id, 4000, 4000 FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- Usage log
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  tokens_charged INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON usage_logs(user_id, created_at DESC);

-- Atomic token deduction function
CREATE OR REPLACE FUNCTION deduct_tokens(p_user_id UUID, p_amount BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE token_balances
  SET balance = balance - p_amount,
      total_used = total_used + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Add tokens (for purchases)
CREATE OR REPLACE FUNCTION add_tokens(p_user_id UUID, p_amount BIGINT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO token_balances (user_id, balance, total_purchased)
  VALUES (p_user_id, p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = token_balances.balance + p_amount,
      total_purchased = token_balances.total_purchased + p_amount,
      updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- User API keys (long-lived, for gateway auth to proxy)
CREATE TABLE IF NOT EXISTS user_api_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL UNIQUE DEFAULT 'oc_' || encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create API key on signup
CREATE OR REPLACE FUNCTION create_user_api_key()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_api_keys (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created_apikey ON auth.users;
CREATE TRIGGER on_auth_user_created_apikey
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_api_key();

-- Give existing users API keys
INSERT INTO user_api_keys (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- RLS
ALTER TABLE token_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own balance
CREATE POLICY "Users can read own balance" ON token_balances
  FOR SELECT USING (auth.uid() = user_id);

-- Users can read their own usage
CREATE POLICY "Users can read own usage" ON usage_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (for the proxy server)
CREATE POLICY "Service role full access balances" ON token_balances
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access usage" ON usage_logs
  FOR ALL USING (auth.role() = 'service_role');
