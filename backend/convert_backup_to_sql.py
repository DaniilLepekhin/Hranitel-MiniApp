#!/usr/bin/env python3
"""
Convert Supabase backup to PostgreSQL format for new Academy MiniApp
"""

import re
from pathlib import Path

# Paths
BACKUP_FILE = Path("/Users/daniillepekhin/My Python/Motivator/Academy MiniApp/db_cluster-20-06-2025@11-29-16.backup")
OUTPUT_FILE = Path("/Users/daniillepekhin/My Python/Motivator/Academy MiniApp 2.0/backend/import_from_backup.sql")

# Category mapping
CATEGORY_MAP = {
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11': 'spiritual',  # Пробудись 2025
    'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12': 'mindset',    # Стратегия будущего
    'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a13': 'spiritual',  # Истинное предназначение
    'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a14': 'spiritual',  # Погружение в интуицию
    'e1eebc99-9c0b-4ef8-bb6d-6bb9bd380a15': 'mindset',    # Деньги и Проявленность
    'f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a16': 'mindset',    # Фокус Внимания
    '71eebc99-9c0b-4ef8-bb6d-6bb9bd380a17': 'esoteric',   # Практикум Хроники Акаши
    '81eebc99-9c0b-4ef8-bb6d-6bb9bd380a18': 'mindset',    # Мастер визуализации
}

def extract_section(content, start_marker):
    """Extract data section from backup"""
    lines = content.split('\n')
    start_idx = None

    for i, line in enumerate(lines):
        if start_marker in line:
            start_idx = i + 1
            break

    if start_idx is None:
        return []

    data_lines = []
    for line in lines[start_idx:]:
        if line.strip() == '\\.':
            break
        if line.strip() and not line.startswith('--'):
            data_lines.append(line)

    return data_lines

def parse_postgres_line(line):
    """Parse PostgreSQL COPY format line"""
    # Split by tabs, handling \N for NULL
    parts = line.split('\t')
    return [None if p == '\\N' else p for p in parts]

def main():
    print("Reading backup file...")
    with open(BACKUP_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    print("Extracting courses...")
    course_lines = extract_section(content, 'COPY public.courses')

    print("Extracting course_days...")
    course_days_lines = extract_section(content, 'COPY public.course_days')

    print(f"Found {len(course_lines)} courses")
    print(f"Found {len(course_days_lines)} course days")

    # Generate SQL
    sql_lines = []
    sql_lines.append("-- Import all courses from Supabase backup")
    sql_lines.append("-- Generated from db_cluster-20-06-2025@11-29-16.backup\n")

    # Insert courses
    sql_lines.append("-- Insert courses")
    for line in course_lines:
        parts = parse_postgres_line(line)
        course_id, title, description, created_at, updated_at = parts
        category = CATEGORY_MAP.get(course_id, 'mindset')

        sql_lines.append(f"""
INSERT INTO courses (id, title, description, category, cover_url, is_premium, created_at, updated_at)
VALUES (
  '{course_id}',
  {repr(title)},
  {repr(description) if description else 'NULL'},
  '{category}',
  NULL,
  false,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;
""")

    # Insert course_days
    sql_lines.append("\n-- Insert course_days")
    for i, line in enumerate(course_days_lines, 1):
        parts = parse_postgres_line(line)
        # Mapping old schema to new schema
        # Old: id, course_id, day_number, title, content, created_at, updated_at,
        #      audio_url, video_url, pdf_url, meditation_guide, additional_content,
        #      welcome_content, course_info, gift_content, stream_link, timer_delay

        id_val = parts[0]
        course_id = parts[1]
        day_number = parts[2]
        title = parts[3]
        content = parts[4]
        audio_url = parts[7] if len(parts) > 7 else None
        video_url = parts[8] if len(parts) > 8 else None
        pdf_url = parts[9] if len(parts) > 9 else None
        meditation_guide = parts[10] if len(parts) > 10 else None
        additional_content = parts[11] if len(parts) > 11 else None
        welcome_content = parts[12] if len(parts) > 12 else None
        course_info = parts[13] if len(parts) > 13 else None
        gift_content = parts[14] if len(parts) > 14 else None
        stream_link = parts[15] if len(parts) > 15 else None

        sql_lines.append(f"""
-- Day {day_number} for course {course_id[:8]}...
INSERT INTO course_days (
  id, course_id, day_number, title, content,
  audio_url, video_url, pdf_url,
  meditation_guide, additional_content, welcome_content,
  course_info, gift_content, stream_link,
  is_premium, created_at, updated_at
)
VALUES (
  '{id_val}',
  '{course_id}',
  {day_number},
  {repr(title)},
  {repr(content) if content else 'NULL'},
  {repr(audio_url) if audio_url else 'NULL'},
  {repr(video_url) if video_url else 'NULL'},
  {repr(pdf_url) if pdf_url else 'NULL'},
  {repr(meditation_guide) if meditation_guide else 'NULL'},
  {repr(additional_content) if additional_content else 'NULL'},
  {repr(welcome_content) if welcome_content else 'NULL'},
  {repr(course_info) if course_info else 'NULL'},
  {repr(gift_content) if gift_content else 'NULL'},
  {repr(stream_link) if stream_link else 'NULL'},
  false,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;
""")

    # Write output
    print(f"Writing SQL to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(sql_lines))

    print(f"✅ Done! Generated {OUTPUT_FILE}")
    print(f"   Courses: {len(course_lines)}")
    print(f"   Lessons: {len(course_days_lines)}")

if __name__ == "__main__":
    main()
