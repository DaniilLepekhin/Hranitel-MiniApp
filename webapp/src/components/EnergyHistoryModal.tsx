'use client';

import { memo } from 'react';
import { Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: 'income' | 'expense';
  reason: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string | null;
  isExpired: boolean;
}

interface EnergyHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions?: Transaction[];
  isLoading: boolean;
}

// 🚀 Мемоизированный компонент транзакции для предотвращения лишних рендеров
const TransactionItem = memo(({ transaction }: { transaction: Transaction }) => {
  const isPositive = transaction.amount > 0;
  const date = new Date(transaction.createdAt);
  const formattedDate = date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        background: isPositive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
        border: `1px solid ${isPositive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 600,
              fontSize: '13px',
              color: '#2d2620',
              marginBottom: '4px',
            }}
          >
            {transaction.reason || 'Начисление энергий'}
          </p>
          <p
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '11px',
              color: '#6b5a4a',
            }}
          >
            {formattedDate} в {formattedTime}
          </p>
          {transaction.metadata?.hashtag ? (
            <p
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 500,
                fontSize: '11px',
                color: '#9c1723',
                marginTop: '2px',
              }}
            >
              {String(transaction.metadata.hashtag)}
              {transaction.metadata.chat_type === 'decade' ? ' (десятка)' : transaction.metadata.chat_type === 'city' ? ' (город)' : ''}
            </p>
          ) : null}
          {transaction.metadata?.leaderBonus ? (
            <p
              style={{
                fontFamily: 'Gilroy, sans-serif',
                fontWeight: 500,
                fontSize: '10px',
                color: '#b8860b',
                marginTop: '2px',
              }}
            >
              x{String(transaction.metadata.multiplier)} бонус лидера
            </p>
          ) : null}
        </div>
        <div
          className="flex-shrink-0"
          style={{
            fontFamily: 'Gilroy, sans-serif',
            fontWeight: 700,
            fontSize: '16px',
            color: isPositive ? '#22c55e' : '#ef4444',
          }}
        >
          {isPositive ? '+' : ''}{transaction.amount} ⚡
        </div>
      </div>

      {transaction.expiresAt && !transaction.isExpired && (
        <div
          className="mt-2 pt-2"
          style={{
            borderTop: '1px solid rgba(45, 38, 32, 0.1)',
          }}
        >
          <p
            style={{
              fontFamily: 'Gilroy, sans-serif',
              fontWeight: 400,
              fontSize: '10px',
              color: '#9c1723',
            }}
          >
            Истекает: {new Date(transaction.expiresAt).toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>
      )}
    </div>
  );
});

TransactionItem.displayName = 'TransactionItem';

// 🚀 Главный компонент модального окна с оптимизацией
export const EnergyHistoryModal = memo(({ isOpen, onClose, transactions, isLoading }: EnergyHistoryModalProps) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in"
      style={{
        background: 'rgba(45, 38, 32, 0.8)',
        backdropFilter: 'blur(8px)',
        willChange: 'opacity',
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[80vh] overflow-hidden animate-scale-in"
        style={{
          borderRadius: '12px',
          background: '#f7f1e8',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          transform: 'translateZ(0)', // GPU ускорение
          willChange: 'transform, opacity',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div
          className="px-5 py-4"
          style={{
            background: 'linear-gradient(256.35deg, rgb(174, 30, 43) 15.72%, rgb(156, 23, 35) 99.39%)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" style={{ color: '#f7f1e8' }} />
              <h3
                style={{
                  fontFamily: '"TT Nooks", Georgia, serif',
                  fontWeight: 300,
                  fontSize: '21px',
                  color: '#f7f1e8',
                }}
              >
                История начислений
              </h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform"
              style={{
                background: 'rgba(247, 241, 232, 0.2)',
              }}
            >
              <span style={{ color: '#f7f1e8', fontSize: '20px' }}>×</span>
            </button>
          </div>
        </div>

        {/* Список транзакций */}
        <div 
          className="overflow-y-auto max-h-[calc(80vh-80px)] p-4"
          style={{
            WebkitOverflowScrolling: 'touch', // Плавная прокрутка на iOS
          }}
        >
          {isLoading ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-3 relative">
                <div
                  className="w-full h-full rounded-full border-4 border-[#2d2620]/10"
                  style={{
                    borderTopColor: '#9c1723',
                    animation: 'spin 1s linear infinite',
                  }}
                />
              </div>
              <p
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontWeight: 400,
                  fontSize: '14px',
                  color: '#2d2620',
                  opacity: 0.7,
                }}
              >
                Загрузка истории...
              </p>
            </div>
          ) : !transactions || transactions.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: '#2d2620' }} />
              <p
                style={{
                  fontFamily: 'Gilroy, sans-serif',
                  fontWeight: 400,
                  fontSize: '14px',
                  color: '#2d2620',
                  opacity: 0.7,
                }}
              >
                История начислений пока пуста
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((transaction) => (
                <TransactionItem key={transaction.id} transaction={transaction} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

EnergyHistoryModal.displayName = 'EnergyHistoryModal';
