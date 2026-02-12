#!/bin/bash
# Apply course enhancements migration

PGPASSWORD="${DATABASE_PASSWORD}" psql -h "${DATABASE_HOST}" -U "${DATABASE_USER}" -d "${DATABASE_NAME}" -f migrations/add_course_enhancements.sql

echo "Migration applied successfully!"
