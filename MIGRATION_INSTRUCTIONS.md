# 🔧 Instructions to Apply Course Migration on Production

## Problem
The production server is showing 500 errors on `/courses/.../progress` endpoint because the database migration for new course fields has not been applied.

## Solution
Apply the SQL migration manually on the production server.

## Steps:

### 1. Connect to Production Server
```bash
ssh root@31.128.36.81
```

### 2. Navigate to Project Directory
```bash
cd /root/club_webapp
```

### 3. Apply Migration via psql
```bash
PGPASSWORD="kH*kyrS&9z7K" psql -h 31.128.36.81 -U postgres -d club_hranitel -f MIGRATION_APPLY.sql
```

**OR** if the SQL file is not on the server, copy-paste the content:

```bash
PGPASSWORD="kH*kyrS&9z7K" psql -h 31.128.36.81 -U postgres -d club_hranitel << 'EOF'
-- [Copy entire content of MIGRATION_APPLY.sql here]
EOF
```

### 4. Verify Migration
After running the migration, you should see output like:
```
✅ Migration completed successfully!
```

And a table showing:
- Total rows in course_days
- Count of video/audio/file/text lessons
- Count of lessons with rutube_url
- Count of lessons with attachments

### 5. Restart Backend (if needed)
```bash
cd /root/club_webapp/backend
pm2 restart backend
```

## What This Migration Does:

1. **Creates enum type** `course_lesson_type` (text, video, audio, file)
2. **Adds column** `lesson_type` to `course_days` table
3. **Adds column** `rutube_url` for dual YouTube/Rutube player
4. **Adds column** `attachments` (JSONB) for multiple PDF files
5. **Updates** existing lessons to set correct lesson_type based on media URLs
6. **Creates index** on lesson_type for better query performance

## Expected Result:
After applying migration, the course "Возвращение к себе" with 17 lessons should work correctly:
- 9 video lessons (with YouTube + Rutube)
- 4 audio lessons (MP3 meditations)
- 3 file lessons (PDF workbooks)
- 1 text lesson (intro)

## Troubleshooting:

### If migration fails with "relation does not exist"
Make sure you're connected to the correct database: `club_hranitel`

### If you see "column already exists"
The migration is designed to skip existing columns. This is OK.

### If errors persist after migration
1. Check backend logs: `pm2 logs backend --lines 50`
2. Restart backend: `pm2 restart backend`
3. Clear any Redis cache if applicable

---

**Created:** 2026-02-12  
**Author:** Claude  
**Related Commits:** 9fe8111, e6d70d8, 02b4d00
