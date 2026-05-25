# 🔧 Setup Guide

## Первый запуск проекта

### 1️⃣ Клонирование репозитория
```bash
git clone https://github.com/yourusername/FlickTap-main.git
cd FlickTap-main
```

### 2️⃣ Установка зависимостей
```bash
npm install
```

### 3️⃣ Конфигурация API ключа
1. Скопируйте `.env.example` в `.env`:
   ```bash
   cp .env.example .env
   ```

2. Откройте `.env` и добавьте ваш API токен:
   ```
   API_TOKEN=a7561cad55b026360ae38eb03a1af11a
   API_BASE=https://api.bhcesh.me
   NODE_ENV=development
   ```

### 4️⃣ Запуск приложения
```bash
npm start
```

## 🛠️ Команды разработки

| Команда | Описание |
|---------|---------|
| `npm start` | Запуск приложения |
| `npm run dev` | Запуск с инструментами разработчика |
| `npm run dist` | Сборка установщика для Windows |

## 📦 Зависимости

- **Electron**: Десктоп фреймворк
- **Axios**: HTTP клиент для API запросов
- **Dotenv**: Загрузка переменных окружения
- **Adblocker**: Блокировка рекламы
- **Electron Store**: Локальное хранилище данных

## 🚨 Важно

⚠️ **Никогда** не коммитьте `.env` файл на GitHub!
- Он содержит чувствительные данные (API ключи)
- Используйте `.env.example` как шаблон
- Каждый разработчик создает свой `.env` локально

## 📚 Дополнительно

- Смотрите [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) для описания структуры проекта
