import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загружаем переменные окружения из .env файла
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

export const config = {
  api: {
    token: process.env.API_TOKEN,
    base: process.env.API_BASE || 'https://api.bhcesh.me'
  },
  app: {
    window: {
      width: 1200,
      height: 750,
      minWidth: 1200,
      minHeight: 750,
      frame: false,
      titleBarStyle: 'hidden',
      backgroundColor: '#0f0f0f'
    }
  },
  env: process.env.NODE_ENV || 'development'
};

// Проверка обязательных переменных
if (!config.api.token) {
  console.warn('⚠️ WARNING: API_TOKEN не установлен в .env файле!');
  console.warn('   Скопируйте .env.example в .env и добавьте ваш API токен.');
}

export default config;
