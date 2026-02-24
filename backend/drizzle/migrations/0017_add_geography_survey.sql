-- 🗺️ Анкета "География клуба"
-- Постоянная анкета, один ответ на пользователя (upsert по user_id)
-- Удаляется каскадно при удалении пользователя

CREATE TABLE IF NOT EXISTS geography_survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS geography_survey_user_idx ON geography_survey_responses(user_id);
CREATE INDEX IF NOT EXISTS geography_survey_city_idx ON geography_survey_responses(city);
