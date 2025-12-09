# Установка туристического сайта

## Требования:
- PostgreSQL
- Node.js

## Шаги установки:

1. **Создайте базу данных:**
   - Откройте pgAdmin
   - Создайте базу данных с именем `tourism_db`

2. **Настройте таблицы:**
   - Откройте Query Tool для базы `tourism_bd`
   - Выполните скрипт из `database_setup.sql`
   - Выполните скрипт из `seed_data.sql`

3. **Настройте сервер:**
   - Убедитесь, что в `server.js` указаны:
     ```javascript
     database: 'tourism_db',
     password: '1',
     PORT: 3002
     ```

4. **Запустите проект:**
   ```bash
   npm install
   node server.js

5. **Откройте в браузере**
   localhost:3002
   localhost:3002/register
   localhost:3002/login