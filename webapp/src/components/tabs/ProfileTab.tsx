'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MapPin,
  Zap,
  FileText,
  ShieldCheck,
  MessageCircleQuestion,
  ChevronRight,
  Edit2,
  User,
  Mail,
  Phone,
  Calendar,
  X,
  Globe,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { energiesApi, cityChatsApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { useRouter } from 'next/navigation';
import { useTelegram } from '@/hooks/useTelegram';

export function ProfileTab() {
  const { user } = useAuthStore();
  const router = useRouter();
  const { haptic } = useTelegram();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user?.firstName || '');
  const [showCityModal, setShowCityModal] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');

  const { data: epData } = useQuery({
    queryKey: ['energies', 'balance', user?.id],
    queryFn: () => energiesApi.getBalance(user!.id),
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Fetch countries for city selection
  const { data: countriesData } = useQuery({
    queryKey: ['city-chats', 'countries'],
    queryFn: () => cityChatsApi.getCountries(),
    enabled: showCityModal,
  });

  // Fetch cities when country is selected
  const { data: citiesData } = useQuery({
    queryKey: ['city-chats', 'cities', selectedCountry],
    queryFn: () => cityChatsApi.getCities(selectedCountry),
    enabled: !!selectedCountry && showCityModal,
  });

  const epBalance = epData?.balance || 0;
  const countries = countriesData?.countries || [];
  const cities = citiesData?.cities || [];

  // Format subscription date
  const formatSubscriptionDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleSaveName = () => {
    // TODO: Implement API call to update user name
    setIsEditingName(false);
  };

  const openUrl = (url: string) => {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      window.Telegram.WebApp.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#3d2f1f] mb-2">Профиль</h1>
        <p className="text-sm text-[#6b5a4a]">
          Это твой личный кабинет в клубе. Здесь собрана вся информация о тебе, твоём статусе, активности и прогрессе
        </p>
      </div>

      {/* Profile Card */}
      <Card className="p-6 mb-6">
        {/* Avatar */}
        <div className="flex items-center gap-4 mb-6">
          {user?.photoUrl ? (
            <img
              src={user.photoUrl}
              alt={user.firstName || 'User'}
              className="w-20 h-20 rounded-full border-4 border-[#8b4513]/20 shadow-lg"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center text-white text-3xl font-bold border-4 border-[#8b4513]/20 shadow-lg">
              {user?.firstName?.[0] || '?'}
            </div>
          )}

          {/* Name Edit */}
          <div className="flex-1">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-[#8b4513]/30 focus:outline-none focus:border-[#8b0000] text-[#3d2f1f] font-semibold"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  className="px-4 py-2 rounded-lg bg-[#8b0000] text-white text-sm font-medium hover:bg-[#a00000] transition-colors"
                >
                  Сохранить
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-[#3d2f1f]">
                  {user?.firstName || 'Имя не указано'}
                </h2>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="w-8 h-8 rounded-lg bg-[#f8f6f0] flex items-center justify-center hover:bg-[#e8dcc6] transition-colors"
                >
                  <Edit2 className="w-4 h-4 text-[#6b5a4a]" />
                </button>
              </div>
            )}
            <p className="text-sm text-[#6b5a4a] mt-1">@{user?.username || 'user'}</p>
          </div>
        </div>

        {/* City */}
        <div className="mb-4 p-4 rounded-xl bg-[#f8f6f0]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center">
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-[#6b5a4a] mb-0.5">Город</p>
                <p className="text-sm font-semibold text-[#3d2f1f]">
                  {user?.city || 'Не выбран'}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                haptic.impact('light');
                setShowCityModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-white text-[#8b0000] text-xs font-medium hover:bg-[#e8dcc6] transition-colors"
            >
              Изменить
            </button>
          </div>
        </div>

        {/* Contact Info */}
        {(user?.email || user?.phone) && (
          <div className="mb-4 space-y-3">
            {user?.email && (
              <div className="p-4 rounded-xl bg-[#f8f6f0]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#8b4513] to-[#6b3410] flex items-center justify-center">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-[#6b5a4a] mb-0.5">Email</p>
                    <p className="text-sm font-semibold text-[#3d2f1f]">{user.email}</p>
                  </div>
                </div>
              </div>
            )}
            {user?.phone && (
              <div className="p-4 rounded-xl bg-[#f8f6f0]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#8b4513] to-[#6b3410] flex items-center justify-center">
                    <Phone className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-[#6b5a4a] mb-0.5">Телефон</p>
                    <p className="text-sm font-semibold text-[#3d2f1f]">{user.phone}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Subscription Status */}
        <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-[#8b0000]/10 to-[#8b4513]/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-[#6b5a4a] mb-0.5">Подписка</p>
              {user?.subscriptionExpires ? (
                <p className="text-sm font-semibold text-[#3d2f1f]">
                  Активна до {formatSubscriptionDate(user.subscriptionExpires)}
                </p>
              ) : (
                <p className="text-sm font-semibold text-[#6b5a4a]">Не активна</p>
              )}
            </div>
          </div>
        </div>

        {/* Club Status */}
        <div className="mb-4 p-4 rounded-xl bg-[#f8f6f0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#8b0000] to-[#8b4513] flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-[#6b5a4a] mb-0.5">Статус в клубе</p>
              <p className="text-sm font-semibold text-[#3d2f1f]">
                {user?.isPro ? 'PRO участник' : 'Участник'}
              </p>
            </div>
          </div>
        </div>

        {/* Energies Balance */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-[#8b0000] to-[#8b4513] text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="w-6 h-6" />
              <div>
                <p className="text-xs opacity-90 mb-0.5">Твои энергии</p>
                <p className="text-2xl font-bold">{epBalance}</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/ratings')}
              className="px-4 py-2 rounded-lg bg-white/20 backdrop-blur-sm text-white text-xs font-medium hover:bg-white/30 transition-colors"
            >
              Рейтинг
            </button>
          </div>
        </div>
      </Card>

      {/* Links Section */}
      <Card className="overflow-hidden mb-6">
        <h3 className="text-lg font-bold text-[#3d2f1f] px-4 pt-4 pb-3 border-b border-[#8b4513]/10">
          Полезные ссылки
        </h3>

        <MenuItem
          icon={<FileText className="w-5 h-5" />}
          label="Правила клуба"
          onClick={() => openUrl('https://storage.daniillepekhin.com/IK%2Fclub_miniapp%2F%D0%9F%D1%80%D0%B0%D0%B2%D0%B8%D0%BB%D0%B0%20%D0%BA%D0%BB%D1%83%D0%B1%D0%B0.pdf')}
        />

        <MenuItem
          icon={<ShieldCheck className="w-5 h-5" />}
          label="Оферта"
          onClick={() => openUrl('https://ishodnyi-kod.com/clubofert')}
        />

        <MenuItem
          icon={<MessageCircleQuestion className="w-5 h-5" />}
          label="Служба заботы"
          onClick={() => openUrl('https://t.me/Egiazarova_support_bot')}
        />
      </Card>

      {/* City Selection Modal */}
      {showCityModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowCityModal(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-6 pb-10 animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#3d2f1f]">Выбор города</h3>
              <button
                onClick={() => setShowCityModal(false)}
                className="w-10 h-10 rounded-full bg-[#f8f6f0] flex items-center justify-center"
              >
                <X className="w-5 h-5 text-[#6b5a4a]" />
              </button>
            </div>

            {/* Country Select */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-[#6b5a4a] mb-2">
                <Globe className="w-4 h-4 inline mr-2" />
                Страна
              </label>
              <select
                value={selectedCountry}
                onChange={(e) => {
                  haptic.selection();
                  setSelectedCountry(e.target.value);
                  setSelectedCity('');
                }}
                className="w-full p-3 rounded-xl border border-[#8b4513]/30 bg-white text-[#3d2f1f] focus:outline-none focus:border-[#8b0000]"
              >
                <option value="">Выберите страну</option>
                {countries.map((country: string) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>

            {/* City Select */}
            {selectedCountry && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-[#6b5a4a] mb-2">
                  <MapPin className="w-4 h-4 inline mr-2" />
                  Город
                </label>
                <select
                  value={selectedCity}
                  onChange={(e) => {
                    haptic.selection();
                    setSelectedCity(e.target.value);
                  }}
                  className="w-full p-3 rounded-xl border border-[#8b4513]/30 bg-white text-[#3d2f1f] focus:outline-none focus:border-[#8b0000]"
                >
                  <option value="">Выберите город</option>
                  {cities.map((city) => (
                    <option key={city.name} value={city.name}>
                      {city.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Save Button */}
            <button
              onClick={() => {
                haptic.impact('medium');
                // TODO: Save city to user profile via API
                setShowCityModal(false);
              }}
              disabled={!selectedCity}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#8b0000] to-[#8b4513] text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Сохранить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function MenuItem({ icon, label, onClick }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 border-b border-[#8b4513]/10 last:border-b-0 hover:bg-[#f8f6f0] transition-colors"
    >
      <span className="text-[#6b5a4a]">{icon}</span>
      <span className="flex-1 text-left font-medium text-[#3d2f1f]">{label}</span>
      <ChevronRight className="w-4 h-4 text-[#8b4513]" />
    </button>
  );
}
