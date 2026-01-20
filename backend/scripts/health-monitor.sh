#!/bin/bash
# 🏥 Health Monitoring Script for КОД ДЕНЕГ 4.0
# Run every 5 minutes via cron: */5 * * * * /var/www/hranitel/backend/scripts/health-monitor.sh

set -e

LOG_FILE="/var/log/hranitel_health.log"
ALERT_FILE="/var/log/hranitel_alerts.log"
MAX_QUEUE_SIZE=1000
MAX_RESPONSE_TIME=500 # ms

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

alert() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - 🚨 ALERT: $1" | tee -a "$ALERT_FILE"
}

# Load environment variables
if [ -f /var/www/hranitel/backend/.env ]; then
  export $(grep -E '^(DATABASE_URL|REDIS_URL)=' /var/www/hranitel/backend/.env | xargs)
fi

echo "════════════════════════════════════════════════════════════"
log "🏥 Starting health check..."
echo "════════════════════════════════════════════════════════════"

# 1. Check Backend Process
echo -e "\n${GREEN}1. Backend Process Check${NC}"
if pm2 list | grep -q "hranitel-backend.*online"; then
  log "✅ Backend process is running"
else
  alert "Backend process is NOT running!"
  exit 1
fi

# 2. Check Frontend Process
echo -e "\n${GREEN}2. Frontend Process Check${NC}"
if pm2 list | grep -q "hranitel-frontend.*online"; then
  log "✅ Frontend process is running"
else
  alert "Frontend process is NOT running!"
  exit 1
fi

# 3. Health Endpoint Check
echo -e "\n${GREEN}3. Health Endpoint Check${NC}"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3002/health)
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
  log "✅ Health endpoint responding (HTTP 200)"
else
  alert "Health endpoint returned HTTP $HTTP_CODE"
fi

# 4. Readiness Check (DB + Redis)
echo -e "\n${GREEN}4. Readiness Check (DB + Redis)${NC}"
READY_RESPONSE=$(curl -s http://localhost:3002/health/ready)
if echo "$READY_RESPONSE" | grep -q '"status":"ready"'; then
  log "✅ Backend is ready (DB + Redis connected)"
else
  alert "Backend not ready: $READY_RESPONSE"
fi

# 5. Database Connection
echo -e "\n${GREEN}5. Database Connection${NC}"
if psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
  log "✅ Database connection OK"

  # Check user count
  USER_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM users;")
  PRO_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM users WHERE is_pro = true;")
  log "📊 Users: $USER_COUNT total, $PRO_COUNT pro"
else
  alert "Database connection FAILED!"
  exit 1
fi

# 6. Redis Connection
echo -e "\n${GREEN}6. Redis Connection${NC}"
if redis-cli ping > /dev/null 2>&1; then
  log "✅ Redis connection OK"

  # Check scheduler queue
  QUEUE_SIZE=$(redis-cli ZCARD scheduler:queue 2>/dev/null || echo "0")
  log "📊 Scheduler queue: $QUEUE_SIZE tasks"

  if [ "$QUEUE_SIZE" -gt "$MAX_QUEUE_SIZE" ]; then
    alert "Scheduler queue is too large: $QUEUE_SIZE > $MAX_QUEUE_SIZE"
  fi
else
  alert "Redis connection FAILED!"
fi

# 7. Materialized Views Freshness
echo -e "\n${GREEN}7. Materialized Views Check${NC}"
CITY_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM city_ratings_cache;" 2>/dev/null || echo "0")
TEAM_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM team_ratings_cache;" 2>/dev/null || echo "0")

if [ "$CITY_COUNT" -gt 0 ] && [ "$TEAM_COUNT" -gt 0 ]; then
  log "✅ Materialized views populated ($CITY_COUNT cities, $TEAM_COUNT teams)"
else
  alert "Materialized views may not be populated correctly"
fi

# 8. Disk Space Check
echo -e "\n${GREEN}8. Disk Space Check${NC}"
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
log "💾 Disk usage: ${DISK_USAGE}%"

if [ "$DISK_USAGE" -gt 90 ]; then
  alert "Disk usage is critical: ${DISK_USAGE}%"
elif [ "$DISK_USAGE" -gt 80 ]; then
  log "⚠️  Disk usage is high: ${DISK_USAGE}%"
fi

# 9. Memory Check
echo -e "\n${GREEN}9. Memory Check${NC}"
MEMORY_USAGE=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
log "🧠 Memory usage: ${MEMORY_USAGE}%"

if [ "$MEMORY_USAGE" -gt 90 ]; then
  alert "Memory usage is critical: ${MEMORY_USAGE}%"
fi

# 10. Response Time Check
echo -e "\n${GREEN}10. Response Time Check${NC}"
RESPONSE_TIME=$(curl -o /dev/null -s -w '%{time_total}\n' http://localhost:3002/health)
RESPONSE_MS=$(echo "$RESPONSE_TIME * 1000" | bc | cut -d. -f1)
log "⏱️  Health endpoint response time: ${RESPONSE_MS}ms"

if [ "$RESPONSE_MS" -gt "$MAX_RESPONSE_TIME" ]; then
  alert "Response time is too slow: ${RESPONSE_MS}ms > ${MAX_RESPONSE_TIME}ms"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
log "✅ Health check completed"
echo "════════════════════════════════════════════════════════════"

# Count alerts in last hour
RECENT_ALERTS=$(grep "$(date '+%Y-%m-%d %H')" "$ALERT_FILE" 2>/dev/null | wc -l)
if [ "$RECENT_ALERTS" -gt 0 ]; then
  echo -e "${RED}⚠️  $RECENT_ALERTS alerts in the last hour${NC}"
  echo "See: $ALERT_FILE"
fi

exit 0
