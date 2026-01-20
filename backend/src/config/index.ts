import * as v from 'valibot';

const envSchema = v.object({
  // Database
  DATABASE_URL: v.pipe(v.string(), v.minLength(1)),

  // Old database for city_chats migration (optional)
  OLD_DATABASE_URL: v.optional(v.string(), ''),

  // Read replica for SELECT queries (optional - falls back to primary)
  READ_REPLICA_URL: v.optional(v.string(), ''),

  // Redis (optional - will work without it)
  REDIS_URL: v.optional(v.string(), ''),

  // Telegram (optional - bot not required for webapp)
  TELEGRAM_BOT_TOKEN: v.optional(v.string(), ''),
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
  // 🔍 Debug: Show environment loading
  console.log('🔧 Loading configuration...');
  console.log(`📁 Working directory: ${process.cwd()}`);
  console.log(`📝 .env file exists: ${require('fs').existsSync('.env') ? 'YES' : 'NO'}`);

  const result = v.safeParse(envSchema, process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error('');
    console.error('🔍 Debug Info:');
    console.error(`  CWD: ${process.cwd()}`);
    console.error(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    console.error(`  DATABASE_URL: ${process.env.DATABASE_URL ? 'SET (' + process.env.DATABASE_URL.substring(0, 20) + '...)' : 'NOT SET'}`);
    console.error(`  JWT_SECRET: ${process.env.JWT_SECRET ? 'SET (length: ' + process.env.JWT_SECRET.length + ')' : 'NOT SET'}`);
    console.error(`  REDIS_URL: ${process.env.REDIS_URL ? 'SET' : 'NOT SET'}`);
    console.error('');
    console.error('Required variables:');
    console.error('  - DATABASE_URL (PostgreSQL connection string)');
    console.error('  - JWT_SECRET (minimum 32 characters)');
    console.error('');
    console.error('Optional variables (app will work without them):');
    console.error('  - REDIS_URL (caching and rate limiting)');
    console.error('  - TELEGRAM_BOT_TOKEN (bot functionality)');
    console.error('  - OPENAI_API_KEY (AI features)');
    console.error('');
    console.error('Validation errors:');
    const flattened = v.flatten(result.issues);
    for (const [key, errors] of Object.entries(flattened.nested || {})) {
      console.error(`  ${key}: ${errors?.[0]}`);
    }
    console.error('');
    console.error('💡 Check your .env file or environment variables in deployment');
    process.exit(1);
  }

  console.log('✅ Configuration loaded successfully');
  return result.output;
}

export const config = loadConfig();

export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
