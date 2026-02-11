'use client';

import { useQuery } from '@tanstack/react-query';
import { energiesApi, type EnergyTransaction } from '@/lib/api';
import { Zap, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

interface EnergyHistoryProps {
  limit?: number;
}

export function EnergyHistory({ limit = 10 }: EnergyHistoryProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['energy-history', limit],
    queryFn: () => energiesApi.getHistory(limit),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card rounded-2xl p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200" />
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-24" />
              </div>
              <div className="h-6 bg-gray-200 rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card rounded-2xl p-6 text-center">
        <p className="text-gray-500">Не удалось загрузить историю</p>
      </div>
    );
  }

  const transactions = data?.transactions || [];

  if (transactions.length === 0) {
    return (
      <div className="card rounded-2xl p-6 text-center">
        <Zap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">История пуста</p>
        <p className="text-sm text-gray-400 mt-1">Начните проходить уроки, чтобы зарабатывать энергии!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 px-1 mb-3">
        Последние {transactions.length} операций
      </h3>
      
      {transactions.map((transaction) => (
        <TransactionItem key={transaction.id} transaction={transaction} />
      ))}
    </div>
  );
}

function TransactionItem({ transaction }: { transaction: EnergyTransaction }) {
  const isIncome = transaction.type === 'income';
  const isExpired = transaction.isExpired;

  return (
    <div className={`card rounded-2xl p-4 transition-all ${isExpired ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isIncome
              ? 'bg-green-100'
              : 'bg-red-100'
          }`}
        >
          {isIncome ? (
            <TrendingUp className="w-5 h-5 text-green-600" />
          ) : (
            <TrendingDown className="w-5 h-5 text-red-600" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">
            {transaction.reason}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
            <Clock className="w-3 h-3" />
            <span>
              {formatDistanceToNow(new Date(transaction.createdAt), {
                addSuffix: true,
                locale: ru,
              })}
            </span>
            {isExpired && (
              <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full text-xs">
                Сгорели
              </span>
            )}
          </div>
        </div>

        {/* Amount */}
        <div
          className={`font-bold text-lg ${
            isIncome ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {isIncome ? '+' : '-'}
          {transaction.amount}
          <span className="ml-1">⚡</span>
        </div>
      </div>

      {/* Expiry info */}
      {isIncome && transaction.expiresAt && !isExpired && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Сгорят{' '}
            {formatDistanceToNow(new Date(transaction.expiresAt), {
              addSuffix: true,
              locale: ru,
            })}
          </p>
        </div>
      )}
    </div>
  );
}
