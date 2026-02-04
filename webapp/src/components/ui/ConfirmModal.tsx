'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  variant?: 'danger' | 'warning' | 'info';
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  isLoading = false,
  variant = 'danger',
}: ConfirmModalProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleClose = () => {
    if (isLoading) return;
    setIsAnimating(false);
    setTimeout(onClose, 200);
  };

  if (!isOpen && !isAnimating) return null;

  const variantStyles = {
    danger: {
      icon: '⚠️',
      confirmBg: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
      confirmHover: '#991b1b',
    },
    warning: {
      icon: '⚡',
      confirmBg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      confirmHover: '#b45309',
    },
    info: {
      icon: 'ℹ️',
      confirmBg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      confirmHover: '#1d4ed8',
    },
  };

  const currentVariant = variantStyles[variant];

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-200 ${
        isAnimating && isOpen ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={`relative w-full max-w-[320px] transform transition-all duration-200 ${
          isAnimating && isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="rounded-2xl overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(180deg, #FFFBF5 0%, #FFF8EE 100%)',
            border: '1px solid rgba(156, 23, 35, 0.1)',
          }}
        >
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4">
            {/* Close button */}
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="absolute top-4 right-4 p-1 rounded-full transition-all hover:bg-black/5 active:scale-95 disabled:opacity-50"
            >
              <X size={20} className="text-[#6b5a4a]" />
            </button>

            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
                style={{
                  background: 'linear-gradient(135deg, rgba(217, 53, 71, 0.1) 0%, rgba(156, 23, 35, 0.15) 100%)',
                  boxShadow: '0 4px 12px rgba(156, 23, 35, 0.1)',
                }}
              >
                {currentVariant.icon}
              </div>
            </div>

            {/* Title */}
            <h3
              className="text-center text-xl font-bold mb-2"
              style={{
                fontFamily: 'Gilroy, sans-serif',
                color: '#2b2520',
              }}
            >
              {title}
            </h3>

            {/* Message */}
            <p
              className="text-center text-sm leading-relaxed"
              style={{
                fontFamily: 'Gilroy, sans-serif',
                color: '#6b5a4a',
              }}
            >
              {message}
            </p>
          </div>

          {/* Divider */}
          <div
            className="h-px mx-6"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(156, 23, 35, 0.15) 50%, transparent 100%)',
            }}
          />

          {/* Actions */}
          <div className="px-6 py-4 flex gap-3">
            {/* Cancel button */}
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-50"
              style={{
                fontFamily: 'Gilroy, sans-serif',
                color: '#6b5a4a',
                background: 'rgba(107, 90, 74, 0.08)',
                border: '1px solid rgba(107, 90, 74, 0.15)',
              }}
            >
              {cancelText}
            </button>

            {/* Confirm button */}
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all active:scale-95 disabled:opacity-70 flex items-center justify-center gap-2"
              style={{
                fontFamily: 'Gilroy, sans-serif',
                background: currentVariant.confirmBg,
                boxShadow: '0 4px 12px rgba(156, 23, 35, 0.25)',
              }}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Отмена...</span>
                </>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
