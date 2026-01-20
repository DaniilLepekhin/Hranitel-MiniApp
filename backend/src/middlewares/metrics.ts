import { Elysia } from 'elysia';
import { redis } from '@/utils/redis';
import { logger } from '@/utils/logger';

/**
 * 📊 Prometheus Metrics Exporter
 *
 * Senior-level application metrics для monitoring и alerting:
 * - Request count (по методу, пути, статусу)
 * - Response time (histogram)
 * - Active requests (gauge)
 * - Cache hit rate
 * - Error rate
 * - Custom business metrics
 *
 * Prometheus format: https://prometheus.io/docs/instrumenting/exposition_formats/
 */

interface MetricSnapshot {
  requestCount: Record<string, number>;
  requestDuration: Record<string, number[]>;
  cacheHits: number;
  cacheMisses: number;
  errorCount: Record<string, number>;
  activeRequests: number;
  customMetrics: Record<string, number>;
}

class MetricsCollector {
  private readonly METRICS_KEY = 'metrics:snapshot';
  private readonly WINDOW_SIZE = 60; // 60 seconds rolling window

  // In-memory counters (fast, but lost on restart - OK for metrics)
  private requestCount: Map<string, number> = new Map();
  private requestDuration: Map<string, number[]> = new Map();
  private errorCount: Map<string, number> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;
  private activeRequests = 0;
  private customMetrics: Map<string, number> = new Map();

  /**
   * Record HTTP request
   */
  recordRequest(method: string, path: string, status: number, duration: number): void {
    // Normalize path (remove IDs)
    const normalizedPath = this.normalizePath(path);
    const key = `${method}:${normalizedPath}:${status}`;

    // Increment request count
    this.requestCount.set(key, (this.requestCount.get(key) || 0) + 1);

    // Record duration
    const durations = this.requestDuration.get(key) || [];
    durations.push(duration);
    // Keep only last 1000 samples to avoid memory leak
    if (durations.length > 1000) durations.shift();
    this.requestDuration.set(key, durations);

    // Record errors (4xx, 5xx)
    if (status >= 400) {
      const errorKey = `${method}:${normalizedPath}:${Math.floor(status / 100)}xx`;
      this.errorCount.set(errorKey, (this.errorCount.get(errorKey) || 0) + 1);
    }
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(hit: boolean): void {
    if (hit) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }
  }

  /**
   * Increment active requests
   */
  incrementActiveRequests(): void {
    this.activeRequests++;
  }

  /**
   * Decrement active requests
   */
  decrementActiveRequests(): void {
    this.activeRequests--;
  }

  /**
   * Record custom business metric
   */
  recordCustomMetric(name: string, value: number): void {
    this.customMetrics.set(name, value);
  }

  /**
   * Increment custom counter
   */
  incrementCustomCounter(name: string, delta: number = 1): void {
    this.customMetrics.set(name, (this.customMetrics.get(name) || 0) + delta);
  }

  /**
   * Normalize path by removing UUIDs and numeric IDs
   */
  private normalizePath(path: string): string {
    return path
      // Remove UUIDs
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      // Remove numeric IDs
      .replace(/\/\d+/g, '/:id')
      // Remove query string
      .split('?')[0];
  }

  /**
   * Calculate percentile from array of values
   */
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    const lines: string[] = [];

    // HELP and TYPE declarations
    lines.push('# HELP http_requests_total Total HTTP requests by method, path, and status');
    lines.push('# TYPE http_requests_total counter');

    // Request counts
    for (const [key, count] of this.requestCount.entries()) {
      const [method, path, status] = key.split(':');
      lines.push(`http_requests_total{method="${method}",path="${path}",status="${status}"} ${count}`);
    }

    // Request duration percentiles
    lines.push('');
    lines.push('# HELP http_request_duration_seconds HTTP request duration in seconds');
    lines.push('# TYPE http_request_duration_seconds summary');

    for (const [key, durations] of this.requestDuration.entries()) {
      const [method, path, status] = key.split(':');
      const labels = `method="${method}",path="${path}",status="${status}"`;

      // Convert ms to seconds
      const durationsInSeconds = durations.map(d => d / 1000);

      lines.push(`http_request_duration_seconds{${labels},quantile="0.5"} ${this.percentile(durationsInSeconds, 50).toFixed(3)}`);
      lines.push(`http_request_duration_seconds{${labels},quantile="0.9"} ${this.percentile(durationsInSeconds, 90).toFixed(3)}`);
      lines.push(`http_request_duration_seconds{${labels},quantile="0.99"} ${this.percentile(durationsInSeconds, 99).toFixed(3)}`);
      lines.push(`http_request_duration_seconds_sum{${labels}} ${durationsInSeconds.reduce((a, b) => a + b, 0).toFixed(3)}`);
      lines.push(`http_request_duration_seconds_count{${labels}} ${durations.length}`);
    }

    // Cache metrics
    lines.push('');
    lines.push('# HELP cache_hits_total Total cache hits');
    lines.push('# TYPE cache_hits_total counter');
    lines.push(`cache_hits_total ${this.cacheHits}`);

    lines.push('# HELP cache_misses_total Total cache misses');
    lines.push('# TYPE cache_misses_total counter');
    lines.push(`cache_misses_total ${this.cacheMisses}`);

    // Cache hit rate
    const totalCacheRequests = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalCacheRequests > 0 ? (this.cacheHits / totalCacheRequests) : 0;
    lines.push('# HELP cache_hit_rate Cache hit rate (0-1)');
    lines.push('# TYPE cache_hit_rate gauge');
    lines.push(`cache_hit_rate ${cacheHitRate.toFixed(3)}`);

    // Active requests
    lines.push('');
    lines.push('# HELP http_requests_active Currently active HTTP requests');
    lines.push('# TYPE http_requests_active gauge');
    lines.push(`http_requests_active ${this.activeRequests}`);

    // Error counts
    lines.push('');
    lines.push('# HELP http_errors_total Total HTTP errors by method, path, and error class');
    lines.push('# TYPE http_errors_total counter');

    for (const [key, count] of this.errorCount.entries()) {
      const [method, path, errorClass] = key.split(':');
      lines.push(`http_errors_total{method="${method}",path="${path}",error_class="${errorClass}"} ${count}`);
    }

    // Custom business metrics
    if (this.customMetrics.size > 0) {
      lines.push('');
      lines.push('# Custom business metrics');

      for (const [name, value] of this.customMetrics.entries()) {
        lines.push(`# HELP ${name} Custom business metric`);
        lines.push(`# TYPE ${name} gauge`);
        lines.push(`${name} ${value}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Get metrics as JSON (for debugging)
   */
  getMetricsJSON(): any {
    return {
      requestCount: Object.fromEntries(this.requestCount),
      requestDuration: Object.fromEntries(
        Array.from(this.requestDuration.entries()).map(([key, values]) => [
          key,
          {
            count: values.length,
            p50: this.percentile(values, 50),
            p90: this.percentile(values, 90),
            p99: this.percentile(values, 99),
            avg: values.reduce((a, b) => a + b, 0) / values.length,
          },
        ])
      ),
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      errorCount: Object.fromEntries(this.errorCount),
      activeRequests: this.activeRequests,
      customMetrics: Object.fromEntries(this.customMetrics),
    };
  }

  /**
   * Reset metrics (useful for testing)
   */
  reset(): void {
    this.requestCount.clear();
    this.requestDuration.clear();
    this.errorCount.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.activeRequests = 0;
    this.customMetrics.clear();
  }
}

// Singleton instance
export const metricsCollector = new MetricsCollector();

/**
 * Metrics collection middleware
 * Automatically tracks all HTTP requests
 */
export const metricsMiddleware = new Elysia({ name: 'metrics' })
  .derive(() => {
    metricsCollector.incrementActiveRequests();
    const startTime = Date.now();
    return { metricsStartTime: startTime };
  })
  .onAfterHandle(({ request, path, set, metricsStartTime }) => {
    const duration = Date.now() - metricsStartTime;
    const status = typeof set.status === 'number' ? set.status : 200;

    metricsCollector.recordRequest(request.method, path, status, duration);
  })
  .onError(({ request, path, metricsStartTime }) => {
    const duration = Date.now() - metricsStartTime;
    metricsCollector.recordRequest(request.method, path, 500, duration);
  })
  .onAfterResponse(() => {
    metricsCollector.decrementActiveRequests();
  });

/**
 * Metrics endpoint for Prometheus scraping
 */
export const metricsEndpoint = new Elysia({ name: 'metrics-endpoint' })
  .get('/metrics', () => {
    return new Response(metricsCollector.exportPrometheusMetrics(), {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
      },
    });
  })
  .get('/metrics/json', () => {
    return metricsCollector.getMetricsJSON();
  });

/**
 * Integration with cache middleware
 * Call this from cache.ts to track cache hits/misses
 */
export function recordCacheMetric(hit: boolean): void {
  metricsCollector.recordCacheHit(hit);
}

/**
 * Record custom business metrics
 *
 * Examples:
 * - Active subscriptions count
 * - Energy points distributed today
 * - Teams created this week
 * - Payment success rate
 */
export function recordBusinessMetric(name: string, value: number): void {
  metricsCollector.recordCustomMetric(name, value);
}

export function incrementBusinessCounter(name: string, delta: number = 1): void {
  metricsCollector.incrementCustomCounter(name, delta);
}

/**
 * Utility: Periodically update business metrics
 * Call this from a cron job or startup
 */
export async function updateBusinessMetrics(): Promise<void> {
  try {
    // Example: Query database for current counts
    // const db = await getDatabase();
    // const userCount = await db.select().from(users).count();
    // recordBusinessMetric('total_users', userCount);

    // For now, just log
    logger.debug('Business metrics updated');
  } catch (error) {
    logger.error({ error }, 'Failed to update business metrics');
  }
}

/**
 * Example Prometheus configuration (prometheus.yml):
 *
 * scrape_configs:
 *   - job_name: 'hranitel-backend'
 *     scrape_interval: 15s
 *     static_configs:
 *       - targets: ['hranitel.daniillepekhin.com:3002']
 *     metrics_path: '/metrics'
 *
 * Example Grafana dashboard queries:
 *
 * 1. Request rate:
 *    rate(http_requests_total[5m])
 *
 * 2. Error rate:
 *    rate(http_errors_total[5m])
 *
 * 3. P99 latency:
 *    http_request_duration_seconds{quantile="0.99"}
 *
 * 4. Cache hit rate:
 *    cache_hit_rate
 *
 * 5. Active requests:
 *    http_requests_active
 */
