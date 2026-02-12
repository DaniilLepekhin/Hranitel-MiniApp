'use client';

import { DualVideoPlayer } from '@/components/video/DualVideoPlayer';
import { AudioLesson } from './AudioLesson';
import { TextLesson } from './TextLesson';
import { FileLesson } from './FileLesson';

export interface LessonData {
  id: string;
  title: string;
  content?: string;
  lessonType: 'text' | 'video' | 'audio' | 'file';
  videoUrl?: string;
  rutubeUrl?: string;
  audioUrl?: string;
  pdfUrl?: string;
  attachments?: { title: string; url: string; type?: string }[];
}

interface LessonRendererProps {
  lesson: LessonData;
  onComplete?: () => void;
}

export function LessonRenderer({ lesson, onComplete }: LessonRendererProps) {
  const { lessonType, title, content, videoUrl, rutubeUrl, audioUrl, pdfUrl, attachments } = lesson;

  switch (lessonType) {
    case 'video':
      if (!videoUrl || !rutubeUrl) {
        return (
          <div className="p-6 rounded-xl bg-red-50 text-red-700">
            <p className="font-semibold">Ошибка:</p>
            <p className="text-sm">Видео урок требует ссылки на YouTube и Rutube</p>
          </div>
        );
      }
      return (
        <DualVideoPlayer
          youtubeUrl={videoUrl}
          rutubeUrl={rutubeUrl}
          title={title}
          description={content}
          onComplete={onComplete}
          pdfUrl={attachments?.[0]?.url} // First attachment as PDF for backward compatibility
        />
      );

    case 'audio':
      if (!audioUrl) {
        return (
          <div className="p-6 rounded-xl bg-red-50 text-red-700">
            <p className="font-semibold">Ошибка:</p>
            <p className="text-sm">Аудио урок требует ссылку на аудио файл</p>
          </div>
        );
      }
      return (
        <AudioLesson
          audioUrl={audioUrl}
          title={title}
          description={content}
          onComplete={onComplete}
          attachments={attachments}
        />
      );

    case 'file':
      if (!pdfUrl) {
        return (
          <div className="p-6 rounded-xl bg-red-50 text-red-700">
            <p className="font-semibold">Ошибка:</p>
            <p className="text-sm">Файловый урок требует ссылку на PDF</p>
          </div>
        );
      }
      return (
        <FileLesson
          title={title}
          description={content}
          pdfUrl={pdfUrl}
          attachments={attachments}
          onComplete={onComplete}
        />
      );

    case 'text':
    default:
      return (
        <TextLesson
          title={title}
          content={content || 'Содержимое урока отсутствует'}
          onComplete={onComplete}
          attachments={attachments}
        />
      );
  }
}
