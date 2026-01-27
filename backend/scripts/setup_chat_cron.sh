#!/bin/bash

# Setup crontab for chat schedule
# This script is called during deploy to ensure cron jobs are configured

SCRIPTS_DIR="/var/www/hranitel/backend/scripts"

# Make scripts executable
chmod +x "${SCRIPTS_DIR}/chat_open_morning.sh"
chmod +x "${SCRIPTS_DIR}/chat_close_evening.sh"

# Create cron entries (Moscow time = UTC+3)
# 10:00 MSK = 07:00 UTC
# 22:00 MSK = 19:00 UTC

CRON_MORNING="0 7 * * * ${SCRIPTS_DIR}/chat_open_morning.sh"
CRON_EVENING="0 19 * * * ${SCRIPTS_DIR}/chat_close_evening.sh"

# Check if cron jobs already exist, if not add them
(crontab -l 2>/dev/null | grep -v "chat_open_morning.sh" | grep -v "chat_close_evening.sh"; echo "${CRON_MORNING}"; echo "${CRON_EVENING}") | crontab -

echo "Chat schedule cron jobs configured:"
echo "  - Morning (10:00 MSK / 07:00 UTC): chat_open_morning.sh"
echo "  - Evening (22:00 MSK / 19:00 UTC): chat_close_evening.sh"
echo ""
echo "Current crontab:"
crontab -l
