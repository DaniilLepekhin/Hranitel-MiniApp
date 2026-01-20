# 🚀 Deployment Checklist - КОД ДЕНЕГ 4.0

## Pre-Deployment (Before pushing to main)

### Code Quality
- [ ] All TypeScript errors resolved (`bun run type-check`)
- [ ] No ESLint errors (`npm run lint`)
- [ ] Code reviewed by at least 1 person (or self-review for critical changes)
- [ ] No hardcoded secrets or credentials in code
- [ ] All console.log() statements removed (except intentional logging)

### Testing
- [ ] Manual testing completed on local environment
- [ ] All new features tested with real user scenarios
- [ ] Payment flows tested (if changed)
- [ ] Bot commands tested (if changed)
- [ ] Mobile responsiveness verified

### Database
- [ ] Migration files created (if schema changed)
- [ ] Migration tested locally
- [ ] Migration is idempotent (can run multiple times safely)
- [ ] Backup strategy confirmed

### Documentation
- [ ] CHANGELOG.md updated with changes
- [ ] README.md updated (if needed)
- [ ] API documentation updated (if endpoints changed)

---

## During Deployment (GitHub Actions)

GitHub Actions will automatically:
- ✅ Pull latest code from `main` branch
- ✅ Run database migrations (0003, 0004, 0005)
- ✅ Check database and Redis connections
- ✅ Backup current PM2 state (for rollback)
- ✅ Install dependencies (Bun + npm)
- ✅ Build backend and frontend
- ✅ Restart services with health checks
- ✅ Setup cron job for materialized views
- ✅ Verify deployment success

**Monitor deployment:** https://github.com/DaniilLepekhin/Hranitel-MiniApp/actions

---

## Post-Deployment (Within 30 minutes)

### 1. Verify Core Functionality (5 mins)

```bash
# Check health endpoints
curl https://hranitel.daniillepekhin.com/health
curl https://hranitel.daniillepekhin.com/health/ready

# Expected: {"status":"ok"} and {"status":"ready"}
```

- [ ] Health endpoint returns 200 OK
- [ ] Readiness endpoint shows DB and Redis connected
- [ ] Frontend loads without errors
- [ ] Backend API responds to requests

### 2. Check Database (5 mins)

```bash
# SSH to server
ssh root@YOUR_SERVER

# Check migrations applied
psql $DATABASE_URL -c "SELECT * FROM payments LIMIT 1;"
psql $DATABASE_URL -c "SELECT * FROM city_ratings_cache LIMIT 1;"

# Check user counts
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users WHERE is_pro = true;"
```

- [ ] `payments` table exists
- [ ] `city_ratings_cache` materialized view exists
- [ ] `team_ratings_cache` materialized view exists
- [ ] User counts look normal

### 3. Check Services (3 mins)

```bash
# On server
pm2 status

# Check logs for errors
pm2 logs hranitel-backend --lines 50 --nostream
pm2 logs hranitel-frontend --lines 50 --nostream
```

- [ ] Backend process is `online`
- [ ] Frontend process is `online`
- [ ] No critical errors in logs
- [ ] Memory usage is normal (<80%)

### 4. Check Redis & Scheduler (3 mins)

```bash
# Check Redis connection
redis-cli ping

# Check scheduler queue
redis-cli ZCARD scheduler:queue

# Check for payment_check tasks
redis-cli ZRANGE scheduler:queue 0 10 WITHSCORES | grep payment_check
```

- [ ] Redis is responding
- [ ] Scheduler queue size is reasonable (<1000)
- [ ] No stuck/old tasks in queue

### 5. Check Cron Jobs (2 mins)

```bash
# Check crontab
crontab -l

# Check cron script exists
ls -la /usr/local/bin/refresh_ratings.sh

# Check cron log
tail -20 /var/log/ratings_refresh.log
```

- [ ] Cron job for materialized views exists (runs at :05 every hour)
- [ ] Script has execute permissions
- [ ] Last refresh was successful

### 6. Test Critical User Flows (10 mins)

#### Flow 1: New User Registration
- [ ] Open bot: https://t.me/hranitelkodbot
- [ ] Send `/start` command
- [ ] Click "Получить доступ"
- [ ] Verify payment form opens
- [ ] (Don't pay, just verify flow works)

#### Flow 2: Pro User Access
- [ ] Login as test Pro user
- [ ] Open webapp: https://hranitel.daniillepekhin.com
- [ ] Check all tabs load (Profile, Chats, Ratings)
- [ ] Verify city ratings show data
- [ ] Verify team rankings show data

#### Flow 3: Bot Commands
- [ ] `/menu` - opens menu with buttons
- [ ] `/app` - opens webapp link
- [ ] Check bot responds to commands

### 7. Performance Check (2 mins)

```bash
# Check response times
curl -o /dev/null -s -w '%{time_total}\n' https://hranitel.daniillepekhin.com/health
curl -o /dev/null -s -w '%{time_total}\n' https://hranitel.daniillepekhin.com/api/profile

# Should be <500ms
```

- [ ] Health endpoint: <100ms
- [ ] API endpoints: <500ms
- [ ] Frontend loads: <2s

---

## Rollback Procedure (If Issues Found)

### Automatic Rollback (if health checks fail)
GitHub Actions will automatically rollback if:
- Backend health check fails
- Database connection fails
- Critical errors during deployment

### Manual Rollback (if issues found after deployment)

```bash
# SSH to server
ssh root@YOUR_SERVER

# Option 1: Rollback to previous commit
cd /var/www/hranitel/backend/scripts
bash rollback.sh

# Option 2: Rollback to specific commit
bash rollback.sh abc123def

# Option 3: Use PM2 resurrect (quick)
pm2 resurrect
```

**After rollback:**
- [ ] Verify health endpoints return 200 OK
- [ ] Check PM2 processes are running
- [ ] Notify team in Slack/Telegram
- [ ] Create GitHub issue with error details

---

## Monitoring (Continuous)

### Automated Health Checks (Every 5 mins)
Script: `/var/www/hranitel/backend/scripts/health-monitor.sh`

Monitors:
- Backend/Frontend process status
- Health endpoints
- Database connection
- Redis connection
- Scheduler queue size
- Disk space
- Memory usage
- Response times

Check alerts:
```bash
tail -50 /var/log/hranitel_alerts.log
```

### Manual Spot Checks (Daily)

```bash
# Check logs for errors
pm2 logs --lines 100 | grep -i error

# Check database stats
psql $DATABASE_URL -c "SELECT
  (SELECT COUNT(*) FROM users) as users,
  (SELECT COUNT(*) FROM users WHERE is_pro = true) as pro_users,
  (SELECT COUNT(*) FROM payments) as payments,
  (SELECT COUNT(*) FROM gift_subscriptions) as gifts;"

# Check materialized view freshness
tail -10 /var/log/ratings_refresh.log
```

---

## Metrics to Track

### Application Metrics
- Total users: `SELECT COUNT(*) FROM users`
- Pro users: `SELECT COUNT(*) FROM users WHERE is_pro = true`
- New signups today: `SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE`
- Active scheduler tasks: `redis-cli ZCARD scheduler:queue`

### Performance Metrics
- API response time: `curl -w '%{time_total}'`
- Database query time: Check logs
- City ratings query: Should be ~5ms (materialized view)
- Team ratings query: Should be ~5ms (materialized view)

### Infrastructure Metrics
- CPU usage: `top`
- Memory usage: `free -m`
- Disk usage: `df -h`
- PM2 restarts: `pm2 list` (should be 0 restarts)

---

## Troubleshooting

### Issue: Backend won't start
```bash
# Check logs
pm2 logs hranitel-backend --lines 100

# Common causes:
# - DATABASE_URL not set
# - TELEGRAM_BOT_TOKEN not set (required in production)
# - Port 3002 already in use
```

### Issue: Migrations fail
```bash
# Check which migrations are applied
psql $DATABASE_URL -c "\dt"

# Manually run missing migration
psql $DATABASE_URL -f /var/www/hranitel/backend/drizzle/migrations/0004_create_payments_table.sql
```

### Issue: Materialized views not refreshing
```bash
# Check cron is running
service cron status

# Check cron log
tail -50 /var/log/ratings_refresh.log

# Manual refresh
psql $DATABASE_URL -c "SELECT refresh_ratings_cache();"
```

### Issue: High scheduler queue
```bash
# Check queue size
redis-cli ZCARD scheduler:queue

# Inspect tasks
redis-cli ZRANGE scheduler:queue 0 10 WITHSCORES

# Clear old tasks (DANGER: only if sure)
redis-cli DEL scheduler:queue
```

---

## Emergency Contacts

- **DevOps Lead:** @DaniilLepekhin
- **Backend Issues:** Check `/var/log/hranitel_alerts.log`
- **Database Issues:** Check PostgreSQL logs
- **Bot Issues:** Check Telegram Bot API status

---

## Post-Mortem Template (If Issues Occur)

```markdown
## Incident: [Brief Description]

**Date:** YYYY-MM-DD HH:MM MSK
**Duration:** X minutes
**Severity:** Critical/High/Medium/Low

### What Happened
[Description of the issue]

### Root Cause
[What caused the issue]

### Impact
- Users affected: [number]
- Services affected: [list]
- Revenue impact: [if applicable]

### Timeline
- HH:MM - Issue detected
- HH:MM - Investigation started
- HH:MM - Root cause identified
- HH:MM - Fix applied
- HH:MM - Service restored

### Resolution
[How it was fixed]

### Prevention
- [ ] Action item 1
- [ ] Action item 2
- [ ] Action item 3

### Lessons Learned
[What we learned]
```

---

**Last Updated:** 2026-01-20
**Version:** 1.0
**Next Review:** After every major deployment
