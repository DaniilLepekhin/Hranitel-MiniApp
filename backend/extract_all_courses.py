#!/usr/bin/env python3
"""
Extract all courses from old Academy MiniApp Supabase migrations
and generate SQL import for new database schema
"""

import re
import os
from pathlib import Path

# Path to old migrations
OLD_MIGRATIONS = Path("/Users/daniillepekhin/My Python/Motivator/Academy MiniApp/supabase/migrations")

# Migration files with course data
COURSE_MIGRATIONS = [
    "20250207182358_royal_resonance.sql",
    "20250220163416_hidden_ocean.sql",
    "20250224082046_proud_spire.sql",
    "20250224100459_fierce_brook.sql",
    "20250302163350_lingering_lodge.sql",
    "20250323172455_divine_truth.sql",
    "20250323175552_tight_wave.sql",
    "20250323191703_holy_canyon.sql",
    "20250323191935_scarlet_wildflower.sql",
    "20250323192811_purple_math.sql",
]

def extract_courses_from_file(filepath):
    """Extract course and course_days data from a migration file"""
    print(f"\n=== Processing {filepath.name} ===")

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    courses = []
    course_days = []

    # Extract course INSERT
    course_pattern = r"INSERT INTO courses.*?VALUES\s*\((.*?)\);"
    course_matches = re.findall(course_pattern, content, re.DOTALL | re.IGNORECASE)

    for match in course_matches:
        # Clean up the values
        values = match.strip()
        print(f"Found course: {values[:100]}...")
        courses.append(values)

    # Extract course_days INSERTs
    days_pattern = r"INSERT INTO course_days.*?VALUES(.*?)(?:;|\n-- )"
    days_matches = re.findall(days_pattern, content, re.DOTALL | re.IGNORECASE)

    for match in days_matches:
        # Split by "),\n  (" to get individual day entries
        days_text = match.strip()
        if days_text:
            print(f"Found course_days block (length: {len(days_text)})")
            course_days.append(days_text)

    return courses, course_days

def main():
    all_courses = []
    all_course_days = []

    for migration_file in COURSE_MIGRATIONS:
        filepath = OLD_MIGRATIONS / migration_file
        if filepath.exists():
            courses, days = extract_courses_from_file(filepath)
            all_courses.extend(courses)
            all_course_days.extend(days)
        else:
            print(f"⚠️  File not found: {filepath}")

    print(f"\n\n=== SUMMARY ===")
    print(f"Total courses found: {len(all_courses)}")
    print(f"Total course_days blocks found: {len(all_course_days)}")

    # Generate SQL output
    output_file = Path("/Users/daniillepekhin/My Python/Motivator/Academy MiniApp 2.0/backend/import_all_courses.sql")

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("-- Import all courses from old Academy MiniApp\n")
        f.write("-- Generated automatically\n\n")

        f.write("-- Insert courses\n")
        for i, course in enumerate(all_courses, 1):
            f.write(f"\n-- Course {i}\n")
            f.write(f"INSERT INTO courses (id, title, description, category, cover_url, is_premium, created_at, updated_at)\n")
            f.write(f"VALUES ({course})\n")
            f.write("ON CONFLICT (id) DO NOTHING;\n")

        f.write("\n\n-- Insert course days\n")
        for i, days_block in enumerate(all_course_days, 1):
            f.write(f"\n-- Course days block {i}\n")
            f.write("INSERT INTO course_days (\n")
            f.write("  course_id,\n")
            f.write("  day_number,\n")
            f.write("  title,\n")
            f.write("  content,\n")
            f.write("  welcome_content,\n")
            f.write("  course_info,\n")
            f.write("  meditation_guide,\n")
            f.write("  additional_content,\n")
            f.write("  gift_content,\n")
            f.write("  stream_link,\n")
            f.write("  video_url,\n")
            f.write("  audio_url,\n")
            f.write("  pdf_url,\n")
            f.write("  is_premium,\n")
            f.write("  created_at,\n")
            f.write("  updated_at\n")
            f.write(")\nVALUES\n")
            f.write(days_block)
            f.write(";\n")

    print(f"\n✅ Generated: {output_file}")
    print(f"\nNow manually review and adjust the SQL file!")

if __name__ == "__main__":
    main()
