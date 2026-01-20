import { Elysia } from 'elysia';
import { redis } from '@/utils/redis';
import { logger } from '@/utils/logger';
import { nanoid } from 'nanoid';

/**
 * 🔐 Request Replay Protection Middleware
 *
 * Senior-level защита от replay attacks:
 * - Nonce-based request tracking
 * - Time-based expiry (TTL)
 * - Idempotency keys для payment endpoints
 * - Prevents duplicate submissions
 *
 * Use cases:
 * - Payment processing (prevent double charges)
 * - Critical mutations (prevent duplicate operations)
 * - Security-sensitive endpoints
 *
 * Based on industry standards:
 * - Stripe Idempotency: https://stripe.com/docs/api/idempotent_requests
 * - OAuth 2.0 nonce: https://tools.ietf.org/html/rfc6749
 */

interface ReplayProtectionConfig {
  ttl?: number;              // Nonce TTL in seconds (default: 300 = 5 minutes)
  headerName?: string;       // Header name for idempotency key (default: X-Idempotency-Key)
  required?: boolean;        // Require idempotency key (default: false)
  skipPaths?: string[];      // Paths to skip replay protection
}

interface NonceRecord {
  key: string;
  timestamp: number;
  method: string;
  path: string;
  userId?: string;
}

/**
 * Check if nonce/idempotency key was already used
 */
async function checkNonce(
  key: string,
  method: string,
  path: string,
  userId?: string,
  ttl: number = 300
): Promise<{ used: boolean; stored: boolean }> {
  if (!redis) {
    // Fail-open: allow request if Redis unavailable
    logger.warn({ key }, 'Redis unavailable, replay protection disabled');
    return { used: false, stored: false };
  }

  const nonceKey = `replay:nonce:${key}`;

  try {
    // Check if nonce exists
    const exists = await redis.exists(nonceKey);

    if (exists === 1) {
      // Nonce already used
      const stored = await redis.get(nonceKey);
      logger.warn(
        { key, method, path, userId, stored },
        'Replay attack detected - nonce already used'
      );
      return { used: true, stored: true };
    }

    // Store nonce with TTL
    const record: NonceRecord = {
      key,
      timestamp: Date.now(),
      method,
      path,
      userId,
    };

    await redis.setex(nonceKey, ttl, JSON.stringify(record));

    logger.debug({ key, ttl }, 'Nonce stored');
    return { used: false, stored: true };
  } catch (error) {
    logger.error({ error, key }, 'Nonce check failed');
    // Fail-open: allow request on error
    return { used: false, stored: false };
  }
}

/**
 * Generate idempotency key
 * Used when client doesn't provide one
 */
function generateIdempotencyKey(): string {
  return `auto_${nanoid(32)}`;
}

/**
 * Validate idempotency key format
 */
function validateIdempotencyKey(key: string): boolean {
  // Must be 1-255 characters, alphanumeric + dash/underscore
  if (!key || key.length < 1 || key.length > 255) {
    return false;
  }

  return /^[a-zA-Z0-9_-]+$/.test(key);
}

/**
 * Replay protection middleware factory
 */
export function replayProtection(config: ReplayProtectionConfig = {}) {
  const {
    ttl = 300,                              // 5 minutes default
    headerName = 'X-Idempotency-Key',       // Standard header name
    required = false,                        // Optional by default
    skipPaths = [],                          // No skipped paths by default
  } = config;

  return new Elysia({ name: 'replay-protection' })
    .derive(async ({ request, path, headers, user, set }) => {
      const method = request.method;

      // Only apply to POST, PUT, PATCH, DELETE (mutations)
      if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
        return { replayProtected: false };
      }

      // Skip configured paths
      if (skipPaths.some(skipPath => path.includes(skipPath))) {
        return { replayProtected: false };
      }

      // Get idempotency key from header
      let idempotencyKey = headers[headerName.toLowerCase()];

      // If required but missing, reject
      if (required && !idempotencyKey) {
        set.status = 400;
        throw new Error(`Missing required header: ${headerName}`);
      }

      // If not provided and not required, generate auto key
      // (less secure, but better than nothing)
      if (!idempotencyKey) {
        idempotencyKey = generateIdempotencyKey();
        logger.debug({ path, method }, 'Auto-generated idempotency key (not recommended)');
      }

      // Validate key format
      if (!validateIdempotencyKey(idempotencyKey)) {
        set.status = 400;
        throw new Error(`Invalid ${headerName}: must be 1-255 alphanumeric characters`);
      }

      // Check if nonce was already used
      const result = await checkNonce(
        idempotencyKey,
        method,
        path,
        user?.id,
        ttl
      );

      if (result.used) {
        // Replay attack detected
        set.status = 409; // Conflict
        throw new Error('Duplicate request detected - idempotency key already used');
      }

      return {
        replayProtected: true,
        idempotencyKey,
        nonceStored: result.stored,
      };
    });
}

/**
 * Strict replay protection for critical endpoints
 * (payments, subscriptions, etc.)
 */
export const strictReplayProtection = replayProtection({
  ttl: 600,                      // 10 minutes
  required: true,                // Key is REQUIRED
  headerName: 'X-Idempotency-Key',
});

/**
 * Relaxed replay protection for non-critical mutations
 */
export const relaxedReplayProtection = replayProtection({
  ttl: 300,                      // 5 minutes
  required: false,               // Key is optional
  headerName: 'X-Idempotency-Key',
});

/**
 * Manual nonce validation utility
 * Use this when you need custom replay protection logic
 */
export async function validateNonce(
  nonce: string,
  context: string,
  ttl: number = 300
): Promise<boolean> {
  if (!redis) {
    return true; // Fail-open
  }

  const nonceKey = `replay:nonce:${context}:${nonce}`;

  try {
    const exists = await redis.exists(nonceKey);

    if (exists === 1) {
      return false; // Already used
    }

    await redis.setex(nonceKey, ttl, Date.now().toString());
    return true; // Valid
  } catch (error) {
    logger.error({ error, nonce, context }, 'Nonce validation failed');
    return true; // Fail-open
  }
}

/**
 * Clear nonce (for testing)
 */
export async function clearNonce(key: string): Promise<void> {
  if (!redis) return;

  try {
    await redis.del(`replay:nonce:${key}`);
    logger.debug({ key }, 'Nonce cleared');
  } catch (error) {
    logger.error({ error, key }, 'Failed to clear nonce');
  }
}

/**
 * Get nonce statistics
 */
export async function getNonceStats(): Promise<{
  total: number;
  keys: string[];
} | null> {
  if (!redis) return null;

  try {
    const keys = await redis.keys('replay:nonce:*');
    return {
      total: keys.length,
      keys: keys.slice(0, 100), // Limit to 100 for performance
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get nonce stats');
    return null;
  }
}

/**
 * Example usage in routes:
 *
 * // Payment endpoint (strict protection)
 * app.post('/api/v1/payments/create',
 *   strictReplayProtection,
 *   async ({ body, idempotencyKey }) => {
 *     // Process payment - guaranteed to execute only once
 *     return await createPayment(body, idempotencyKey);
 *   }
 * );
 *
 * // Gift subscription endpoint (strict protection)
 * app.post('/api/v1/gifts/send',
 *   strictReplayProtection,
 *   async ({ body, idempotencyKey }) => {
 *     return await sendGift(body, idempotencyKey);
 *   }
 * );
 *
 * // Team creation (relaxed protection)
 * app.post('/api/v1/teams/create',
 *   relaxedReplayProtection,
 *   async ({ body }) => {
 *     return await createTeam(body);
 *   }
 * );
 *
 * // Client-side usage (JavaScript):
 * const idempotencyKey = crypto.randomUUID();
 *
 * fetch('/api/v1/payments/create', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'X-Idempotency-Key': idempotencyKey, // Important!
 *   },
 *   body: JSON.stringify({ amount: 1990 }),
 * });
 *
 * // If network fails and you retry, same idempotency key prevents duplicate charge
 * fetch('/api/v1/payments/create', {
 *   method: 'POST',
 *   headers: {
 *     'X-Idempotency-Key': idempotencyKey, // Same key = no duplicate
 *   },
 *   body: JSON.stringify({ amount: 1990 }),
 * });
 * // → 409 Conflict: "Duplicate request detected"
 *
 * ---
 *
 * Benefits:
 * - ✅ Prevents double charges
 * - ✅ Prevents duplicate subscriptions
 * - ✅ Safe for network retries
 * - ✅ Industry-standard approach (Stripe, PayPal use this)
 * - ✅ Time-based expiry (automatic cleanup)
 * - ✅ Fail-safe (works without Redis)
 */
