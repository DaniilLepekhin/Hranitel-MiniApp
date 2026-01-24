// PM2 Ecosystem Configuration
// This file configures how PM2 runs the Hranitel backend

module.exports = {
  apps: [{
    name: 'hranitel-backend',
    script: 'bun',
    args: 'run src/index.ts',
    cwd: '/var/www/hranitel/backend',

    // Single instance - Bun is already highly optimized
    // For scaling, use multiple servers behind a load balancer
    instances: 1,
    exec_mode: 'fork',

    // Environment variables loaded from .env file
    env_file: '.env',

    // Auto-restart configuration
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',

    // Logging
    error_file: '/var/log/pm2/hranitel-backend-error.log',
    out_file: '/var/log/pm2/hranitel-backend-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // Restart policy
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,

    // Graceful shutdown (match backend SHUTDOWN_TIMEOUT_MS)
    kill_timeout: 30000,
    wait_ready: true,
    listen_timeout: 15000,

    // Health monitoring
    exp_backoff_restart_delay: 100,
  }]
};
