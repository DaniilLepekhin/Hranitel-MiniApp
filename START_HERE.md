# 🚀 НАЧНИТЕ ОТСЮДА

## Шаг 1: Добавьте GitHub Secrets (5 минут)

### Откройте файл с секретами:
📄 **[SECRETS_QUICK_COPY.md](SECRETS_QUICK_COPY.md)**

### Или используйте команды:
```bash
# Посмотреть секреты
cat "SECRETS_QUICK_COPY.md"
```

### Добавьте секреты на GitHub:
1. Откройте: https://github.com/DaniilLepekhin/Academy_MiniApp_2.0/settings/secrets/actions
2. Для каждого секрета:
   - Нажмите **"New repository secret"**
   - Скопируйте **Name** из файла
   - Скопируйте **Secret** (значение)
   - Нажмите **"Add secret"**

### ⚠️ ВАЖНО:
- **OPENAI_API_KEY** - получите свой ключ на https://platform.openai.com/api-keys
- Если у вас есть домен, замените URL в секретах **WEBAPP_URL** и **API_URL**

---

## Шаг 2: Запустите деплой (1 минута)

```bash
# Перейдите в папку проекта
cd "Motivator/Academy MiniApp 2.0"

# Добавьте все файлы (кроме секретов - они в .gitignore)
git add .

# Закоммитьте
git commit -m "Initial deployment setup"

# Запустите деплой
git push origin main
```

---

## Шаг 3: Проверьте деплой

### Откройте GitHub Actions:
https://github.com/DaniilLepekhin/Academy_MiniApp_2.0/actions

### Дождитесь зелёной галочки ✅

Должны выполниться 4 шага:
1. ✅ Lint & Type Check
2. ✅ Build
3. ✅ Build Docker Images
4. ✅ Deploy to Production

---

## Шаг 4: Проверьте приложение

### На сервере:
```bash
ssh root@2.58.98.41
# Пароль: 6gNJOtZexhZG2nQwiamOYxUx

cd /opt/academy-miniapp
docker compose ps
```

### Проверьте в браузере:
- 🌐 WebApp: http://2.58.98.41
- 🔌 API: http://2.58.98.41/api/docs (Swagger)
- ❤️ Health: http://2.58.98.41/health

### Проверьте Telegram Bot:
Откройте: https://t.me/AcademyMiniApp2Bot
Отправьте: `/start`

---

## 🎉 Готово!

Ваше приложение развёрнуто и работает!

---

## 📚 Дополнительная информация

### Основная документация:
- 📖 [README.md](README.md) - полная документация
- ⚡ [QUICKSTART.md](QUICKSTART.md) - быстрый старт
- ✅ [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - чеклист деплоя
- 🖥️ [SERVER_SETUP.md](SERVER_SETUP.md) - настройка сервера

### Секреты и конфигурация:
- 🔑 [SECRETS_QUICK_COPY.md](SECRETS_QUICK_COPY.md) - секреты для GitHub
- 🔐 [GITHUB_SECRETS.md](GITHUB_SECRETS.md) - подробная инструкция
- ⚙️ [.env.example](.env.example) - пример переменных окружения

### Сводка проекта:
- 📊 [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - полная сводка проекта

---

## 🆘 Нужна помощь?

### Если деплой не работает:
1. Проверьте логи GitHub Actions
2. Убедитесь, что все 9 секретов добавлены
3. Проверьте логи на сервере:
   ```bash
   ssh root@2.58.98.41
   cd /opt/academy-miniapp
   docker compose logs -f
   ```

### Если приложение не открывается:
```bash
# На сервере
docker compose restart
docker compose ps
```

---

## 🔑 Учётные данные

**Сервер:**
- IP: `2.58.98.41`
- User: `root`
- Password: `6gNJOtZexhZG2nQwiamOYxUx`

**Telegram Bot:**
- Username: `@AcademyMiniApp2Bot`
- Token: `5908684144:AAETU_38dgMyln-PlC8KZ7arAHAUQiLqGgM`

**GitHub:**
- Repo: https://github.com/DaniilLepekhin/Academy_MiniApp_2.0
- Actions: https://github.com/DaniilLepekhin/Academy_MiniApp_2.0/actions

---

**Создано с ❤️ для Academy MiniApp 2.0**
