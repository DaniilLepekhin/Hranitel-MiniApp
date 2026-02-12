import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function applyMigration() {
  console.log('📦 Applying course enhancements migration...\n');

  try {
    // 1. Create enum type
    console.log('Creating course_lesson_type enum...');
    try {
      await db.execute(sql`
        CREATE TYPE course_lesson_type AS ENUM ('text', 'video', 'audio', 'file')
      `);
      console.log('✅ Enum created');
    } catch (error: any) {
      if (error.code === '42710') {
        console.log('⚠️  Enum already exists, skipping');
      } else {
        throw error;
      }
    }

    // 2. Add lesson_type column
    console.log('\nAdding lesson_type column...');
    try {
      await db.execute(sql`
        ALTER TABLE course_days 
        ADD COLUMN lesson_type course_lesson_type DEFAULT 'text' NOT NULL
      `);
      console.log('✅ Column added');
    } catch (error: any) {
      if (error.code === '42701') {
        console.log('⚠️  Column already exists, skipping');
      } else {
        throw error;
      }
    }

    // 3. Add rutube_url column
    console.log('\nAdding rutube_url column...');
    try {
      await db.execute(sql`
        ALTER TABLE course_days 
        ADD COLUMN rutube_url TEXT
      `);
      console.log('✅ Column added');
    } catch (error: any) {
      if (error.code === '42701') {
        console.log('⚠️  Column already exists, skipping');
      } else {
        throw error;
      }
    }

    // 4. Add attachments column
    console.log('\nAdding attachments column...');
    try {
      await db.execute(sql`
        ALTER TABLE course_days 
        ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb
      `);
      console.log('✅ Column added');
    } catch (error: any) {
      if (error.code === '42701') {
        console.log('⚠️  Column already exists, skipping');
      } else {
        throw error;
      }
    }

    // 5. Update existing video lessons
    console.log('\nUpdating existing video lessons...');
    await db.execute(sql`
      UPDATE course_days 
      SET lesson_type = 'video' 
      WHERE video_url IS NOT NULL
    `);
    console.log('✅ Updated');

    // 6. Update existing audio lessons
    console.log('\nUpdating existing audio lessons...');
    await db.execute(sql`
      UPDATE course_days 
      SET lesson_type = 'audio' 
      WHERE audio_url IS NOT NULL AND video_url IS NULL
    `);
    console.log('✅ Updated');

    // 7. Create index
    console.log('\nCreating index...');
    try {
      await db.execute(sql`
        CREATE INDEX course_days_lesson_type_idx ON course_days(lesson_type)
      `);
      console.log('✅ Index created');
    } catch (error: any) {
      if (error.code === '42P07') {
        console.log('⚠️  Index already exists, skipping');
      } else {
        throw error;
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\nAdded:');
    console.log('  - lesson_type enum (text, video, audio, file)');
    console.log('  - rutube_url column for dual video player');
    console.log('  - attachments jsonb column for multiple files');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

applyMigration();
