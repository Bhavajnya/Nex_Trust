import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Firebase
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
  firebasePrivateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID || '',
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '',
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  firebaseClientId: process.env.FIREBASE_CLIENT_ID || '',
  firebaseAuthUri: process.env.FIREBASE_AUTH_URI || '',
  firebaseTokenUri: process.env.FIREBASE_TOKEN_URI || '',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',

  // API
  apiUrl: process.env.API_URL || 'http://localhost:3001',
  corsOrigin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:8080'],

  // OpenAI (for AI verification) - Optional if using mock AI
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4-vision-preview',

  // AI Service Configuration
  useMockAI: process.env.USE_MOCK_AI === 'true',

  // AI Verification (higher threshold for money release: 90% confidence required)
  verificationConfidenceThreshold: parseFloat(process.env.VERIFICATION_CONFIDENCE_THRESHOLD || '0.90'),
  verificationTimeoutMs: parseInt(process.env.VERIFICATION_TIMEOUT_MS || '30000'),
};

export function validateConfig(): void {
  const required = [
    'firebaseProjectId',
    'firebasePrivateKey',
    'firebaseClientEmail',
    'redisUrl',
  ];

  const missing: string[] = [];
  for (const key of required) {
    if (!config[key as keyof typeof config]) {
      missing.push(key);
      console.error(`[Config] CRITICAL: Missing required environment variable: ${key}`);
    }
  }

  if (missing.length > 0) {
    console.error(`[Config] Cannot start without: ${missing.join(', ')}`);
    console.error('[Config] Set these env vars before starting');
  }

  // Stripe is optional for local testing with mocks
  if (!config.stripeSecretKey) {
    console.warn('[Config] Stripe key not set - using mock payments');
  }
}
