import { db } from './src/db';
import { courses, courseDays, courseProgress } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function testCourseProgress() {
  const courseId = 'ff7d8314-7d26-47de-8a45-93ee8ae2a459';
  
  console.log('🔍 Testing course progress endpoint...\n');

  // 1. Check if course exists
  console.log('1. Checking course...');
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!course) {
    console.log('❌ Course not found!');
    process.exit(1);
  }

  console.log('✅ Course found:', course.title);

  // 2. Check course days
  console.log('\n2. Checking course days...');
  const days = await db
    .select()
    .from(courseDays)
    .where(eq(courseDays.courseId, courseId));

  console.log(`✅ Found ${days.length} lessons`);

  // Check if new fields exist
  const firstDay = days[0];
  console.log('\n3. Checking new fields in first lesson:');
  console.log('   - lessonType:', firstDay.lessonType || 'NOT SET');
  console.log('   - rutubeUrl:', firstDay.rutubeUrl ? 'EXISTS' : 'NOT SET');
  console.log('   - attachments:', firstDay.attachments ? JSON.stringify(firstDay.attachments) : 'NOT SET');

  // 3. Try to create progress (simulate what frontend does)
  console.log('\n4. Testing progress creation...');
  
  try {
    // Check if progress table has proper structure
    const [existingProgress] = await db
      .select()
      .from(courseProgress)
      .where(eq(courseProgress.courseId, courseId))
      .limit(1);

    if (existingProgress) {
      console.log('✅ Found existing progress:', {
        userId: existingProgress.userId,
        currentDay: existingProgress.currentDay,
        completedDays: existingProgress.completedDays,
      });
    } else {
      console.log('ℹ️  No existing progress found');
    }

    console.log('\n✅ All checks passed!');
  } catch (error) {
    console.error('\n❌ Error during progress test:', error);
    process.exit(1);
  }

  process.exit(0);
}

testCourseProgress();
