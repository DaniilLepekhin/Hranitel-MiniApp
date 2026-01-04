import * as v from 'valibot';

const envSchema = v.object({
  // Database
  DATABASE_URL: v.pipe(v.string(), v.minLength(1)),

  // Redis
  REDIS_URL: v.pipe(v.string(), v.minLength(1)),

  // Telegram
  TELEGRAM_BOT_TOKEN: v.pipe(v.string(), v.minLength(1)),
  TELEGRAM_BOT_USERNAME: v.optional(v.string(), 'AcademyMiniApp2Bot'),
  TELEGRAM_WEBHOOK_SECRET: v.optional(v.string()),

  // JWT
  JWT_SECRET: v.pipe(v.string(), v.minLength(32)),

  // OpenAI
  OPENAI_API_KEY: v.optional(v.string()),

  // App
  NODE_ENV: v.optional(v.picklist(['development', 'production', 'test']), 'development'),
  PORT: v.optional(v.pipe(v.string(), v.transform(Number)), '3001'),
  WEBAPP_URL: v.optional(v.string(), 'http://localhost:3000'),
  API_URL: v.optional(v.string(), 'http://localhost:3001'),

  // CORS
  CORS_ORIGIN: v.optional(v.string(), 'http://localhost:3000'),
});

type EnvConfig = v.InferOutput<typeof envSchema>;

function loadConfig(): EnvConfig {
  const result = v.safeParse(envSchema, process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(v.flatten(result.issues));
    process.exit(1);
  }

  return result.output;
}

export const config = loadConfig();

export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
