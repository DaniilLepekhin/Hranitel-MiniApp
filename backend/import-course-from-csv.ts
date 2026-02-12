import { db } from './src/db';
import { courses, courseDays } from './src/db/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

interface CSVRow {
  'Раздел': string;
  'Формат': string;
  'Название': string;
  'Ссылка': string;
  'Ссылка ютуб': string;
  'Ссылка рутуб': string;
  'Описание': string;
  'Комментарий/дополнение': string;
  'Ссылка на дополнение': string;
}

async function importCourse() {
  console.log('📦 Импорт курса "Возвращение к себе"...\n');

  // Read CSV
  const csvPath = path.join(__dirname, '../migration/Деньги по-женски код идентичности.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  const records: CSVRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Найдено ${records.length} строк в CSV\n`);

  // 1. Create or update course
  const courseName = 'Возвращение к себе';
  console.log(`Creating/updating course: ${courseName}...`);

  const [existingCourse] = await db
    .select()
    .from(courses)
    .where(eq(courses.title, courseName))
    .limit(1);

  let courseId: string;

  if (existingCourse) {
    console.log('✅ Course already exists, using existing ID');
    courseId = existingCourse.id;
  } else {
    const [newCourse] = await db
      .insert(courses)
      .values({
        title: courseName,
        description: 'Глубокая внутренняя работа через коучинговые инструменты, психологические практики и медитации. Программа помогает остановиться, услышать себя и перезапустить внутренние сценарии.',
        category: 'mindset',
        isPremium: false,
        isActive: true,
        sortOrder: 0,
      })
      .returning();

    courseId = newCourse.id;
    console.log('✅ Course created with ID:', courseId);
  }

  // 2. Import lessons
  console.log('\n📚 Importing lessons...\n');

  let dayNumber = 0;
  
  for (const row of records) {
    // Skip header row or section dividers
    if (!row['Формат'] || row['Раздел'] === 'Возвращение к себе') continue;
    
    dayNumber++;
    
    const format = row['Формат'].toLowerCase();
    const title = row['Название'];
    const description = row['Описание'];
    const directLink = row['Ссылка'];
    const youtubeLink = row['Ссылка ютуб'];
    const rutubeLink = row['Ссылка рутуб'];
    const attachmentComment = row['Комментарий/дополнение'];
    const attachmentLinks = row['Ссылка на дополнение'];

    // Determine lesson type
    let lessonType: 'text' | 'video' | 'audio' | 'file' = 'text';
    let videoUrl: string | null = null;
    let rutubeUrl: string | null = null;
    let audioUrl: string | null = null;
    let pdfUrl: string | null = null;

    if (format === 'видео') {
      lessonType = 'video';
      videoUrl = youtubeLink || null;
      rutubeUrl = rutubeLink || null;
    } else if (format === 'аудио') {
      lessonType = 'audio';
      audioUrl = directLink || null;
    } else if (format === 'файл') {
      lessonType = 'file';
      pdfUrl = directLink || null;
    } else if (format === 'текст') {
      lessonType = 'text';
    }

    // Parse attachments
    const attachments: { title: string; url: string; type?: string }[] = [];
    
    if (attachmentLinks && attachmentLinks !== '-') {
      const links = attachmentLinks.split(/\n\n\n/).map(l => l.trim()).filter(Boolean);
      const titles = attachmentComment ? attachmentComment.split(/\n/).map(t => t.trim()).filter(Boolean) : [];
      
      links.forEach((url, index) => {
        const title = titles[index] || `Дополнительный материал ${index + 1}`;
        attachments.push({
          title,
          url,
          type: 'pdf',
        });
      });
    }

    console.log(`  ${dayNumber}. ${title} (${lessonType})`);

    // Check if lesson already exists
    const [existing] = await db
      .select()
      .from(courseDays)
      .where(eq(courseDays.courseId, courseId))
      .where(eq(courseDays.dayNumber, dayNumber))
      .limit(1);

    if (existing) {
      // Update
      await db
        .update(courseDays)
        .set({
          title,
          content: description || '',
          lessonType,
          videoUrl,
          rutubeUrl,
          audioUrl,
          pdfUrl,
          attachments,
          updatedAt: new Date(),
        })
        .where(eq(courseDays.id, existing.id));
      
      console.log(`     ✅ Updated`);
    } else {
      // Insert
      await db.insert(courseDays).values({
        courseId,
        dayNumber,
        title,
        content: description || '',
        lessonType,
        videoUrl,
        rutubeUrl,
        audioUrl,
        pdfUrl,
        attachments,
        isPremium: false,
      });
      
      console.log(`     ✅ Created`);
    }
  }

  console.log(`\n✅ Импорт завершён! Добавлено ${dayNumber} уроков.`);
  console.log(`\nКурс ID: ${courseId}`);
  console.log(`Название: ${courseName}`);
  process.exit(0);
}

importCourse().catch((error) => {
  console.error('❌ Import failed:', error);
  process.exit(1);
});
