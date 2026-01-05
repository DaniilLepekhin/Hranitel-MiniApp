#!/usr/bin/env python3
"""
Cleanup all lesson content in the database:
1. Fix \\n\\n -> actual line breaks
2. Remove \\u200d zero-width joiner characters
3. Clean up any other escape sequences
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor

# Database connection
DATABASE_URL = os.getenv(
    'DATABASE_URL',
    'postgresql://postgres:postgres@2.58.98.41:5432/academy_miniapp'
)

def clean_text(text):
    """Clean text content"""
    if not text:
        return text

    # Replace literal \\n with actual newlines
    text = text.replace('\\n', '\n')

    # Remove zero-width joiner and other invisible characters
    text = text.replace('\u200d', '')
    text = text.replace('\u200b', '')  # zero-width space
    text = text.replace('\u200c', '')  # zero-width non-joiner
    text = text.replace('\ufeff', '')  # zero-width no-break space (BOM)

    # Clean up multiple consecutive newlines (keep max 2)
    while '\n\n\n' in text:
        text = text.replace('\n\n\n', '\n\n')

    # Remove trailing/leading whitespace from each line
    lines = text.split('\n')
    lines = [line.rstrip() for line in lines]
    text = '\n'.join(lines)

    # Remove leading/trailing newlines
    text = text.strip()

    return text

def main():
    print("Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Get all course days
    print("Fetching all lessons...")
    cur.execute("""
        SELECT id, title, content, welcome_content, course_info,
               meditation_guide, additional_content, gift_content
        FROM course_days
    """)

    lessons = cur.fetchall()
    print(f"Found {len(lessons)} lessons")

    updated_count = 0

    for lesson in lessons:
        lesson_id = lesson['id']
        updates = {}

        # Check each text field
        for field in ['content', 'welcome_content', 'course_info',
                     'meditation_guide', 'additional_content', 'gift_content']:
            original = lesson[field]
            if original:
                cleaned = clean_text(original)
                if cleaned != original:
                    updates[field] = cleaned

        if updates:
            # Build UPDATE query
            set_parts = [f"{field} = %s" for field in updates.keys()]
            values = list(updates.values())
            values.append(lesson_id)

            query = f"""
                UPDATE course_days
                SET {', '.join(set_parts)}
                WHERE id = %s
            """

            cur.execute(query, values)
            updated_count += 1

            print(f"✅ Updated lesson: {lesson['title']}")
            for field in updates.keys():
                print(f"   - Cleaned {field}")

    conn.commit()

    print(f"\n✅ Cleanup complete!")
    print(f"   Updated {updated_count} out of {len(lessons)} lessons")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
