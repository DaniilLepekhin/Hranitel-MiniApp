'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTelegram } from '@/hooks/useTelegram';
import { useAuthStore } from '@/store/auth';
import { energiesApi, usersApi } from '@/lib/api';
import { OptimizedBackground } from '@/components/ui/OptimizedBackground';
import { Edit2, X, Check } from 'lucide-react';

export function ProfileTab() {
  const router = useRouter();
  const { haptic, webApp } = useTelegram();
  const { user, token, setUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [loadingLink, setLoadingLink] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');

  // 🚀 МГНОВЕННЫЙ РЕНДЕР: Получаем баланс энергий пользователя
  const { data: balanceData } = useQuery({
    queryKey: ['energies-balance', user?.id],
    queryFn: () => energiesApi.getBalance(user!.id),
    enabled: !!user && !!token,
    retry: false,
    placeholderData: { success: true, balance: 0 }, // Показываем 0 сразу для мгновенного рендера
  });

  // 🚀 МЕМОИЗАЦИЯ: Вычисляем только когда данные меняются
  const userBalance = useMemo(() => balanceData?.balance || 0, [balanceData?.balance]);
  const displayName = useMemo(() => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user?.firstName || user?.username || 'Пользователь';
  }, [user?.firstName, user?.lastName, user?.username]);

  // ✏️ Mutation для обновления профиля
  const updateProfileMutation = useMutation({
    mutationFn: usersApi.updateProfile,
    onSuccess: (data) => {
      console.log('Profile updated successfully:', data);
      haptic.notification('success');
      // Обновляем пользователя в store
      if (user && data.user) {
        setUser({ ...user, ...data.user });
      }
      setIsEditingName(false);
    },
    onError: (error: any) => {
      console.error('Profile update error:', error);
      console.error('Error response:', error.response?.data);
      haptic.notification('error');
    },
  });

  // 📝 Функции для редактирования имени
  const startEditingName = useCallback(() => {
    setEditFirstName(user?.firstName || '');
    setEditLastName(user?.lastName || '');
    setIsEditingName(true);
    haptic.impact('light');
  }, [user, haptic]);

  const cancelEditingName = useCallback(() => {
    setIsEditingName(false);
    haptic.impact('light');
  }, [haptic]);

  const saveEditedName = useCallback(() => {
    if (!editFirstName.trim()) {
      haptic.notification('warning');
      webApp?.showAlert('Пожалуйста, введите имя. Это обязательное поле.');
      return;
    }

    const updateData: { firstName: string; lastName?: string } = {
      firstName: editFirstName.trim(),
    };

    // Только добавляем lastName если он не пустой
    const trimmedLastName = editLastName.trim();
    if (trimmedLastName) {
      updateData.lastName = trimmedLastName;
    }

    console.log('Updating profile with:', JSON.stringify(updateData, null, 2));
    haptic.impact('medium');
    updateProfileMutation.mutate(updateData);
  }, [editFirstName, editLastName, updateProfileMutation, haptic, webApp]);

  // 🚀 ОПТИМИЗИРОВАННАЯ функция открытия ссылок с визуальной обратной связью
  const openLink = useCallback((url: string, linkType: string) => {
    setLoadingLink(linkType);
    haptic.impact('medium');

    // 📱 Внутренние ссылки (документы) - используем Next.js роутинг
    if (url.startsWith('/')) {
      router.push(url);
      setTimeout(() => setLoadingLink(null), 300);
      return;
    }

    // ⚡️ МГНОВЕННОЕ открытие Telegram ссылок
    if (url.startsWith('https://t.me/')) {
      if (webApp?.openTelegramLink) {
        webApp.openTelegramLink(url);
      } else {
        window.open(url, '_blank');
      }
      setTimeout(() => setLoadingLink(null), 300);
      return;
    }

    // 🌐 Внешние ссылки
    if (webApp?.openLink) {
      webApp.openLink(url);
    } else {
      window.open(url, '_blank');
    }
    setTimeout(() => setLoadingLink(null), 500);
  }, [haptic, webApp, router]);

  return (
    <div className="min-h-screen w-full bg-[#f7f1e8] relative">
      {/* 🚀 ОПТИМИЗИРОВАННЫЙ ФОН */}
      <OptimizedBackground variant="profile" />

      {/* ===== КОНТЕНТ ===== */}
      <div className="relative z-10 pt-[23px] pb-28">
        {/* Иконка профиля - бордовый цвет */}
        <div className="flex justify-center mb-[17px]">
          <div
            style={{
              width: '37.326px',
              height: '37.326px',
              backgroundColor: '#9c1723',
              WebkitMaskImage: 'url(/assets/profile-icon.png)',
              WebkitMaskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskImage: 'url(/assets/profile-icon.png)',
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
            }}
          />
        </div>

        {/* Заголовок */}
        <h1
          className="text-center mb-4"
          style={{
            fontFamily: '"TT Nooks", Georgia, serif',
            fontWeight: 300,
            fontSize: '42.949px',
            lineHeight: 0.95,
            letterSpacing: '-2.5769px',
            color: '#2d2620',
            maxWidth: '340px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Это твой личный кабинет в клубе.
        </h1>

        {/* Описание */}
        <p
          className="text-center mb-6"
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 400,
            fontSize: '13px',
            lineHeight: 1.45,
            letterSpacing: '-0.26px',
            color: '#2d2620',
            maxWidth: '269px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          <span style={{ fontWeight: 700 }}>Здесь собрана вся информация</span>
          {' о тебе, твоём статусе, активности и прогрессе'}
        </p>

        {/* ===== КАРТОЧКА ПРОФИЛЯ ===== */}
        <div
          className="relative mx-[30px]"
          style={{
            border: '1px solid #2d2620',
            borderRadius: '20px',
            minHeight: '280px',
            marginBottom: '24px',
          }}
        >
          {/* Контент карточки - центрированный flex контейнер */}
          <div className="absolute inset-0 flex flex-col items-center justify-start pt-[24px] px-[24px]">

            {/* Верхняя часть - Аватар и текст */}
            <div className="flex items-start justify-center mb-6" style={{ width: '100%' }}>
              {/* Аватар слева */}
              <div style={{ flexShrink: 0 }}>
                {user?.photoUrl ? (
                  <img
                    src={user.photoUrl}
                    alt={displayName}
                    className="rounded-full"
                    style={{
                      width: '93px',
                      height: '93px',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div
                    className="rounded-full flex items-center justify-center"
                    style={{
                      width: '93px',
                      height: '93px',
                      background: '#d9d9d9',
                    }}
                  />
                )}
              </div>

              {/* Текстовая часть справа от аватара */}
              <div className="flex-1 flex flex-col items-center justify-start ml-4">
                {/* Имя с кнопкой редактирования */}
                <div className="flex items-center justify-center gap-2 mb-[8px]">
                  <p
                    className="text-center"
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 400,
                      fontSize: '21.167px',
                      lineHeight: 1.45,
                      letterSpacing: '-0.4233px',
                      color: '#2d2620',
                    }}
                  >
                    {displayName}
                  </p>
                  <button
                    onClick={startEditingName}
                    className="flex items-center justify-center p-1 hover:bg-black/5 rounded-full transition-colors active:scale-95"
                    aria-label="Редактировать имя"
                  >
                    <Edit2 className="w-4 h-4" style={{ color: '#9c1723' }} />
                  </button>
                </div>

                {/* Город */}
                <p
                  className="text-center mb-[16px]"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 400,
                    fontSize: '15.993px',
                    lineHeight: 1.45,
                    letterSpacing: '-0.3199px',
                    color: '#2d2620',
                  }}
                >
                  {user?.city ? `г. ${user.city}` : 'Город не указан'}
                </p>

                {/* Бейдж статуса */}
                <div
                  style={{
                    border: '0.955px solid #d93547',
                    borderRadius: '5.731px',
                    background: 'linear-gradient(242.804deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
                    paddingLeft: '16px',
                    paddingRight: '16px',
                    height: '33px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <p
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 700,
                      fontSize: '14px',
                      lineHeight: 1.45,
                      letterSpacing: '-0.28px',
                      color: 'white',
                    }}
                  >
                    {user?.isPro ? 'Участник' : 'Новичек'}
                  </p>
                </div>
              </div>
            </div>

            {/* ===== БЛОК БАЛАНСА ===== */}
            <div
              className="w-full relative overflow-hidden"
              style={{
                borderRadius: '8px',
                background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
                minHeight: '100px',
              }}
            >
              {/* Декоративная картинка */}
              <div
                className="absolute overflow-hidden"
                style={{
                  left: '16px',
                  bottom: '12px',
                  width: 'min(50%, 200px)',
                  height: '45px',
                  borderRadius: '6px',
                  border: '1px solid rgba(244, 214, 182, 0.4)',
                }}
              >
                <img
                  alt=""
                  className="w-full h-full object-cover"
                  src="/assets/balance-image.jpg"
                />
              </div>

              {/* Контент */}
              <div className="relative z-10 h-full flex justify-between p-4">
                <p
                  style={{
                    fontFamily: '"TT Nooks", Georgia, serif',
                    fontWeight: 300,
                    fontSize: 'clamp(20px, 5vw, 24px)',
                    color: 'rgb(247, 241, 232)',
                  }}
                >
                  Мой баланс
                </p>

                <div className="text-right">
                  <p
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 600,
                      fontSize: 'clamp(40px, 10vw, 48px)',
                      color: 'rgb(247, 241, 232)',
                      lineHeight: 1,
                    }}
                  >
                    {userBalance}
                  </p>
                  <p
                    style={{
                      fontFamily: 'Gilroy, sans-serif',
                      fontWeight: 400,
                      fontSize: 'clamp(16px, 4vw, 19px)',
                      color: 'rgb(247, 241, 232)',
                    }}
                  >
                    энергий
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ===== ССЫЛКИ ===== */}
        <div className="space-y-[20px] px-[30px]">
          <button
            onClick={() => openLink('/docs/rules', 'rules')}
            disabled={loadingLink === 'rules'}
            className="w-full text-center transition-all active:scale-95 disabled:opacity-50"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '18.517px',
              lineHeight: 1.45,
              letterSpacing: '-0.3703px',
              color: loadingLink === 'rules' ? '#9c1723' : '#2d2620',
              textDecoration: 'underline',
              textDecorationColor: loadingLink === 'rules' ? '#9c1723' : '#2d2620',
            }}
          >
            {loadingLink === 'rules' ? 'Открываю...' : 'Правила клуба'}
          </button>

          <button
            onClick={() => openLink('https://ishodnyi-kod.com/clubofert', 'offer')}
            disabled={loadingLink === 'offer'}
            className="w-full text-center transition-all active:scale-95 disabled:opacity-50"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '18.517px',
              lineHeight: 1.45,
              letterSpacing: '-0.3703px',
              color: loadingLink === 'offer' ? '#9c1723' : '#2d2620',
              textDecoration: 'underline',
              textDecorationColor: loadingLink === 'offer' ? '#9c1723' : '#2d2620',
            }}
          >
            {loadingLink === 'offer' ? 'Открываю...' : 'Оферта'}
          </button>

          <button
            onClick={() => openLink('https://t.me/Egiazarova_support_bot', 'support')}
            disabled={loadingLink === 'support'}
            className="w-full text-center transition-all active:scale-95 disabled:opacity-50"
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '18.517px',
              lineHeight: 1.45,
              letterSpacing: '-0.3703px',
              color: loadingLink === 'support' ? '#9c1723' : '#2d2620',
              textDecoration: 'underline',
              textDecorationColor: loadingLink === 'support' ? '#9c1723' : '#2d2620',
            }}
          >
            {loadingLink === 'support' ? 'Открываю...' : 'Служба заботы'}
          </button>
        </div>
      </div>

      {/* ===== МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ ИМЕНИ ===== */}
      {isEditingName && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={cancelEditingName}
        >
          <div
            className="bg-[#f7f1e8] rounded-2xl p-6 mx-4 w-full max-w-md"
            style={{ border: '1px solid #2d2620' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                style={{
                  fontFamily: '"TT Nooks", Georgia, serif',
                  fontWeight: 300,
                  fontSize: '24px',
                  color: '#2d2620',
                }}
              >
                Редактировать имя
              </h3>
              <button
                onClick={cancelEditingName}
                className="p-1 hover:bg-black/5 rounded-full transition-colors"
              >
                <X className="w-5 h-5" style={{ color: '#2d2620' }} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Поле "Имя" */}
              <div>
                <label
                  htmlFor="firstName"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#2d2620',
                    display: 'block',
                    marginBottom: '8px',
                  }}
                >
                  Имя <span style={{ color: '#9c1723' }}>*</span>
                </label>
                <input
                  id="firstName"
                  type="text"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  placeholder="Введите имя"
                  autoFocus
                  className="w-full px-4 py-3 rounded-lg"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '16px',
                    color: '#2d2620',
                    border: '1px solid #2d2620',
                    backgroundColor: '#fff',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Поле "Фамилия" */}
              <div>
                <label
                  htmlFor="lastName"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#2d2620',
                    display: 'block',
                    marginBottom: '8px',
                  }}
                >
                  Фамилия
                </label>
                <input
                  id="lastName"
                  type="text"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  placeholder="Введите фамилию (необязательно)"
                  className="w-full px-4 py-3 rounded-lg"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontSize: '16px',
                    color: '#2d2620',
                    border: '1px solid #2d2620',
                    backgroundColor: '#fff',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Кнопки */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={cancelEditingName}
                  disabled={updateProfileMutation.isPending}
                  className="flex-1 py-3 rounded-lg transition-all active:scale-95"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    color: '#2d2620',
                    border: '1px solid #2d2620',
                    backgroundColor: 'transparent',
                  }}
                >
                  Отмена
                </button>
                <button
                  onClick={saveEditedName}
                  disabled={updateProfileMutation.isPending || !editFirstName.trim()}
                  className="flex-1 py-3 rounded-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{
                    fontFamily: 'Gilroy, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    color: '#fff',
                    background: 'linear-gradient(243.413deg, rgb(174, 30, 43) 15.721%, rgb(156, 23, 35) 99.389%)',
                    border: 'none',
                  }}
                >
                  {updateProfileMutation.isPending ? (
                    <>
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Сохраняю...
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Сохранить
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
