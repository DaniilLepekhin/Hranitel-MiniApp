'use client';

import { FileText, Download, ExternalLink } from 'lucide-react';

interface MaterialLinksProps {
  text: string;
  className?: string;
}

/**
 * Компонент для парсинга текста и отображения ссылок на материалы
 * Находит паттерны типа "Методичка: https://..." или "Презентация: https://..."
 * и превращает их в кликабельные кнопки
 */
export function MaterialLinks({ text, className = '' }: MaterialLinksProps) {
  // Регулярка для поиска материалов с URL
  // Формат: "Методичка: https://..." или "Презентация: https://..."
  const materialPattern = /((?:Методичка|Презентация|Материал|Гайд|PDF|Документ|Файл)[:\s]+)(https?:\/\/[^\s<>"]+)/gi;

  const materials: { label: string; url: string; isPdf: boolean }[] = [];
  let match;

  while ((match = materialPattern.exec(text)) !== null) {
    const label = match[1].replace(/[:\s]+$/, '').trim();
    const url = match[2];
    const isPdf = url.toLowerCase().endsWith('.pdf');
    materials.push({ label, url, isPdf });
  }

  if (materials.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {materials.map((material, index) => (
        <a
          key={index}
          href={material.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
        >
          {material.isPdf ? (
            <FileText className="w-4 h-4" />
          ) : (
            <ExternalLink className="w-4 h-4" />
          )}
          <span>{material.label}</span>
          <Download className="w-4 h-4" />
        </a>
      ))}
    </div>
  );
}

/**
 * Функция для очистки текста от ссылок на материалы
 * Убирает паттерны "Методичка: https://..." из текста
 */
export function cleanTextFromMaterialLinks(text: string): string {
  const materialPattern = /\s*((?:Методичка|Презентация|Материал|Гайд|PDF|Документ|Файл)[:\s]+)(https?:\/\/[^\s<>"]+)/gi;
  return text.replace(materialPattern, '').trim();
}
