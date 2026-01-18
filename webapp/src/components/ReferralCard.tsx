'use client';

import { useState } from 'react';
import { Copy, Share2, Users, CheckCircle2 } from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { Card } from '@/components/ui/Card';

interface ReferralCardProps {
  invitedCount?: number;
}

export function ReferralCard({ invitedCount = 0 }: ReferralCardProps) {
  const { user } = useAuthStore();
  const { haptic, webApp } = useTelegram();
  const [copied, setCopied] = useState(false);

  const botUsername = 'hranitel_kod_bot';
  const referralLink = user ? `https://t.me/${botUsername}?start=ref_${user.telegramId}` : '';

  const referralMessage = `🎯 Привет! Я в Клубе КОД ДЕНЕГ — здесь я прокачиваю свои финансовые навыки и меняю отношение к деньгам.

🔑 12 Ключей к изобилию, практические инструменты, поддержка сообщества и реальные результаты.

👉 Присоединяйся по моей ссылке и начни свой путь к финансовой свободе:
${referralLink}

Увидимся внутри! 💰✨`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      haptic.notification('success');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleShareMessage = () => {
    haptic.impact('medium');
    // Use tg://msg_url to send message with text
    const encodedMessage = encodeURIComponent(referralMessage);
    const shareUrl = `tg://msg_url?url=${encodeURIComponent(referralLink)}&text=${encodedMessage}`;

    if (webApp?.openTelegramLink) {
      webApp.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  };

  return (
    <Card className="p-4 bg-gradient-to-br from-[#d93547]/10 to-[#9c1723]/10 border-[#9c1723]/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-[#2b2520] flex items-center gap-2">
          <Users className="w-5 h-5 text-[#d93547]" />
          Пригласи друзей
        </h3>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#d93547]/20 rounded-lg border border-[#9c1723]/30">
          <Users className="w-3.5 h-3.5 text-[#d93547]" />
          <span className="text-[#2b2520] font-bold text-sm">{invitedCount}</span>
        </div>
      </div>

      {/* Description */}
      <p className="text-[#6b5a4a] text-xs mb-3 leading-relaxed">
        Поделись возможностью финансового роста с друзьями и получай бонусы за каждого приглашённого участника
      </p>

      {/* Referral Link */}
      <div className="mb-3 p-2.5 bg-white/80 rounded-lg border border-[#9c1723]/20 flex items-center gap-2">
        <div className="flex-1 overflow-hidden">
          <p className="text-[#6b5a4a] text-[9px] mb-0.5 font-medium">Твоя реферальная ссылка:</p>
          <p className="text-[#2b2520] text-xs font-mono truncate">{referralLink}</p>
        </div>
        <button
          onClick={handleCopyLink}
          className="flex-shrink-0 p-2 rounded-lg bg-[#e8dcc6] hover:bg-[#d4c5a9] active:scale-95 transition-all"
        >
          {copied ? (
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          ) : (
            <Copy className="w-4 h-4 text-[#d93547]" />
          )}
        </button>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleCopyLink}
          className="px-3 py-2.5 rounded-lg bg-white border-2 border-[#9c1723]/30 text-[#2b2520] font-semibold text-xs flex items-center justify-center gap-2 hover:border-[#d93547] hover:bg-[#d93547]/5 active:scale-95 transition-all"
        >
          <Copy className="w-4 h-4" />
          {copied ? 'Скопировано!' : 'Копировать'}
        </button>
        <button
          onClick={handleShareMessage}
          className="px-3 py-2.5 rounded-lg bg-gradient-to-r from-[#d93547] to-[#9c1723] text-white font-semibold text-xs flex items-center justify-center gap-2 hover:shadow-lg active:scale-95 transition-all"
        >
          <Share2 className="w-4 h-4" />
          Отправить
        </button>
      </div>
    </Card>
  );
}
