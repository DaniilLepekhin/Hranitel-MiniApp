'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Mic,
  MicOff,
  Sparkles,
  User,
  Bot,
  Trash2,
  Loader2,
} from 'lucide-react';
import { aiApi } from '@/lib/api';
import type { ChatMessage } from '@/lib/api';

export function ChatTab() {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const queryClient = useQueryClient();

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['chat-history'],
    queryFn: () => aiApi.history(50),
  });

  const messages = historyData?.messages || [];

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      // Add user message optimistically
      const userMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData(['chat-history'], (old: any) => ({
        ...old,
        messages: [...(old?.messages || []), userMessage],
      }));

      setIsStreaming(true);
      setStreamingContent('');

      // Use streaming
      const response = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: content }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                setStreamingContent(fullContent);
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }

      return fullContent;
    },
    onSuccess: () => {
      setIsStreaming(false);
      queryClient.invalidateQueries({ queryKey: ['chat-history'] });
    },
    onError: () => {
      setIsStreaming(false);
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => aiApi.clearHistory(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-history'] });
    },
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleSend = () => {
    if (!message.trim() || sendMutation.isPending) return;

    sendMutation.mutate(message.trim());
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());

        // Transcribe audio
        try {
          // Convert Blob to base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = reader.result?.toString().split(',')[1] || '';
            const result = await aiApi.transcribe(base64Audio);
            if (result.text) {
              setMessage(result.text);
            }
          };
        } catch (error) {
          console.error('Transcription error:', error);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white">AI Помощник</h1>
            <p className="text-xs text-gray-500">Всегда на связи</p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            onClick={() => clearMutation.mutate()}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-400"
            disabled={clearMutation.isPending}
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
          </div>
        ) : messages.length === 0 && !isStreaming ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Streaming message */}
            {isStreaming && streamingContent && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="card rounded-2xl rounded-tl-none px-4 py-3 max-w-[80%]">
                  <p className="text-gray-800 whitespace-pre-wrap">{streamingContent}</p>
                  <span className="inline-block w-1 h-4 bg-purple-500 animate-pulse ml-1" />
                </div>
              </div>
            )}

            {/* Typing indicator */}
            {sendMutation.isPending && !streamingContent && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="card rounded-2xl rounded-tl-none px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce animation-delay-100" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce animation-delay-200" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-100 bg-white/80 backdrop-blur-lg">
        <div className="flex items-end gap-2">
          {/* Voice button */}
          <button
            onClick={toggleRecording}
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              isRecording
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {isRecording ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>

          {/* Text input */}
          <div className="flex-1 glass rounded-2xl px-4 py-2">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Напишите сообщение..."
              rows={1}
              className="w-full bg-transparent resize-none focus:outline-none text-gray-900 placeholder-gray-400 max-h-32"
              disabled={sendMutation.isPending}
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!message.trim() || sendMutation.isPending}
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              message.trim() && !sendMutation.isPending
                ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-lg'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser
            ? 'bg-gradient-to-br from-orange-400 to-pink-500'
            : 'bg-gradient-to-br from-purple-500 to-indigo-600'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[80%] px-4 py-3 ${
          isUser
            ? 'bg-gradient-to-br from-orange-400 to-pink-500 text-white rounded-2xl rounded-tr-none'
            : 'card rounded-2xl rounded-tl-none'
        }`}
      >
        <p className={`whitespace-pre-wrap ${isUser ? 'text-white' : 'text-gray-800'}`}>
          {message.content}
        </p>
        <p
          className={`text-xs mt-1 ${
            isUser ? 'text-white/70' : 'text-gray-400'
          }`}
        >
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  const suggestions = [
    'Как начать медитировать?',
    'Расскажи о дыхательных практиках',
    'Как справиться со стрессом?',
    'Что такое осознанность?',
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mb-6">
        <Sparkles className="w-10 h-10 text-white" />
      </div>

      <h2 className="text-xl font-bold text-white mb-2">
        Привет! Я ваш AI помощник
      </h2>
      <p className="text-gray-300 mb-6">
        Задайте мне любой вопрос о медитации, осознанности или личностном росте
      </p>

      <div className="space-y-2 w-full max-w-sm">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            className="w-full glass rounded-xl px-4 py-3 text-left text-gray-200 hover:shadow-md transition-all"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
