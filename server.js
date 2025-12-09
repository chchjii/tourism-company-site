const crypto = require('crypto');

// Функция для генерации токена сессии
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

const http = require('http');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const { Pool } = require('pg');
const url = require('url');


const PORT = 3002;

// Подключение к PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'tourism_db',
    password: '1',
    port: 5432,
});

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

// Функция для генерации токена сессии
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Функция для получения пользователя из сессии
async function getCurrentUser(req) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies.session_token;

    if (!sessionToken) {
        return null;
    }

    try {
        const result = await pool.query(
            `SELECT u.* FROM users u 
             JOIN sessions s ON u.id = s.user_id 
             WHERE s.session_token = $1 AND s.expires_at > NOW()`,
            [sessionToken]
        );

        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        console.error('Ошибка проверки сессии:', error);
        return null;
    }
}

// Парсинг cookies
function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;

    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        if (parts.length === 2) {
            cookies[parts[0].trim()] = parts[1].trim();
        }
    });

    return cookies;
}

// Функция для обслуживания файлов
function serveFile(res, filename) {
    const filePath = path.join(__dirname, filename);
    fs.readFile(filePath, 'utf8', (err, content) => {
        if (err) {
            res.writeHead(500);
            res.end('Ошибка сервера');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
    });
}

// Функция для построения SQL запроса с фильтрами (оставляем вашу существующую функцию)
function buildToursQuery(filters = {}) {
    // ... ваш существующий код функции buildToursQuery ...
    // Оставляем без изменений
}

// Фоновая задача для очистки просроченных сессий и резервирований
function cleanupExpiredData() {
    setInterval(async () => {
        try {
            // Очищаем просроченные сессии
            const expiredSessions = await pool.query(
                "DELETE FROM sessions WHERE expires_at < NOW() RETURNING id"
            );

            // Очищаем просроченные резервирования
            const expiredReservations = await pool.query(
                `DELETE FROM reservations 
                 WHERE status = 'reserved' AND expires_at < NOW() 
                 RETURNING id, tour_id`
            );

            // Освобождаем туры из просроченных резервирований
            for (const row of expiredReservations.rows) {
                await pool.query(
                    'UPDATE tours SET is_available = true WHERE id = $1',
                    [row.tour_id]
                );
            }

            console.log(`Очищено: ${expiredSessions.rowCount} сессий, ${expiredReservations.rowCount} резервирований`);

        } catch (error) {
            console.error('Ошибка очистки данных:', error);
        }
    }, 60000); // Каждую минуту
}

// Функция для построения SQL запроса с фильтрами
function buildToursQuery(filters = {}) {
    console.log('🎯 buildToursQuery вызвана с фильтрами:', JSON.stringify(filters, null, 2));

    let sql = 'SELECT * FROM tours WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    console.log('🔧 Проверка параметров:');

    // Фильтр по городу отправления
    if (filters.from && filters.from.trim() !== '' && filters.from !== 'undefined') {
        console.log(`  ✓ from: "${filters.from}"`);
        sql += ` AND from_city ILIKE $${paramIndex}`;
        params.push(`%${filters.from}%`);
        paramIndex++;
    } else {
        console.log(`  ✗ from: пусто или undefined`);
    }

    // Фильтр по городу назначения
    if (filters.to && filters.to.trim() !== '' && filters.to !== 'undefined') {
        console.log(`  ✓ to: "${filters.to}"`);
        sql += ` AND to_city ILIKE $${paramIndex}`;
        params.push(`%${filters.to}%`);
        paramIndex++;
    } else {
        console.log(`  ✗ to: пусто или undefined`);
    }

    // Фильтр по транспорту
    if (filters.transport && filters.transport.trim() !== '' && filters.transport !== 'undefined') {
        console.log(`  ✓ transport: "${filters.transport}"`);
        sql += ` AND transport = $${paramIndex}`;
        params.push(filters.transport);
        paramIndex++;
    } else {
        console.log(`  ✗ transport: пусто или undefined`);
    }

    // Фильтр по минимальной цене
    if (filters.minPrice && filters.minPrice !== '' && filters.minPrice !== 'undefined') {
        const minPrice = parseFloat(filters.minPrice);
        if (!isNaN(minPrice) && minPrice > 0) {
            console.log(`  ✓ minPrice: ${minPrice}`);
            sql += ` AND price >= $${paramIndex}`;
            params.push(minPrice);
            paramIndex++;
        } else {
            console.log(`  ✗ minPrice: не число или <= 0 (${filters.minPrice})`);
        }
    }

    // Фильтр по максимальной цене
    if (filters.maxPrice && filters.maxPrice !== '' && filters.maxPrice !== 'undefined') {
        const maxPrice = parseFloat(filters.maxPrice);
        if (!isNaN(maxPrice) && maxPrice > 0) {
            console.log(`  ✓ maxPrice: ${maxPrice}`);
            sql += ` AND price <= $${paramIndex}`;
            params.push(maxPrice);
            paramIndex++;
        } else {
            console.log(`  ✗ maxPrice: не число или <= 0 (${filters.maxPrice})`);
        }
    }

    // Фильтр по минимальной длительности
    if (filters.minDays && filters.minDays !== '' && filters.minDays !== 'undefined') {
        const minDays = parseInt(filters.minDays);
        if (!isNaN(minDays) && minDays > 0) {
            console.log(`  ✓ minDays: ${minDays}`);
            sql += ` AND days >= $${paramIndex}`;
            params.push(minDays);
            paramIndex++;
        } else {
            console.log(`  ✗ minDays: не число или <= 0 (${filters.minDays})`);
        }
    }

    // Фильтр по максимальной длительности
    if (filters.maxDays && filters.maxDays !== '' && filters.maxDays !== 'undefined') {
        const maxDays = parseInt(filters.maxDays);
        if (!isNaN(maxDays) && maxDays > 0) {
            console.log(`  ✓ maxDays: ${maxDays}`);
            sql += ` AND days <= $${paramIndex}`;
            params.push(maxDays);
            paramIndex++;
        } else {
            console.log(`  ✗ maxDays: не число или <= 0 (${filters.maxDays})`);
        }
    }

    // Фильтр по горящим турам
    if (filters.hot_tours === 'hot_only') {
        console.log(`  ✓ hot_tours: только горящие`);
        sql += ` AND is_hot = true`;
    } else {
        console.log(`  ✗ hot_tours: все туры (${filters.hot_tours})`);
    }

    // Фильтр по доступности туров
    sql += ` AND is_available = true`;

    // Определяем порядок сортировки
    const orderBy = [];

    // Сортировка по длине
    if (filters.sort_days === 'days_asc') {
        console.log(`  ✓ sort_days: по возрастанию длины`);
        orderBy.push('days ASC');
    } else if (filters.sort_days === 'days_desc') {
        console.log(`  ✓ sort_days: по убыванию длины`);
        orderBy.push('days DESC');
    }

    // Сортировка по цене
    if (filters.sort_price === 'price_asc') {
        console.log(`  ✓ sort_price: по возрастанию цены`);
        orderBy.push('price ASC');
    } else if (filters.sort_price === 'price_desc') {
        console.log(`  ✓ sort_price: по убыванию цены`);
        orderBy.push('price DESC');
    }

    // Добавляем сортировку, если есть
    if (orderBy.length > 0) {
        sql += ' ORDER BY ' + orderBy.join(', ');
    } else {
        // Сортировка по умолчанию
        sql += ' ORDER BY created_at DESC';
        console.log(`  ✓ Сортировка по умолчанию: created_at DESC`);
    }

    console.log('📋 Итоговый SQL:', sql);
    console.log('📦 Итоговые параметры:', params);
    console.log('---');

    return { sql, params };
}


// ==================== ОСНОВНОЙ СЕРВЕР ====================

const server = http.createServer(async (req, res) => {
    console.log(`Запрошен URL: ${req.url}, Метод: ${req.method}`);

    // Получаем текущего пользователя
    const currentUser = await getCurrentUser(req);

    // Парсим URL
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // 1. Главная страница
    if (req.method === 'GET' && pathname === '/') {
        serveFile(res, 'main-page.html');
    }

    // 2. Страница поиска
    else if (req.method === 'GET' && pathname === '/search') {
        if (!currentUser) {
            res.writeHead(302, { 'Location': '/login' });
            res.end();
            return;
        }
        serveFile(res, 'main.html');
    }

    // 3. Страница результатов
    else if (req.method === 'GET' && pathname === '/results') {
        if (!currentUser) {
            res.writeHead(302, { 'Location': '/login' });
            res.end();
            return;
        }
        serveFile(res, 'results.html');
    }

    // 4. Страница входа
    else if (req.method === 'GET' && pathname.startsWith('/login')) {
        // Если уже авторизован, перенаправляем на поиск
        if (currentUser) {
            res.writeHead(302, { 'Location': '/search' });
            res.end();
            return;
        }
        serveFile(res, 'login.html');
    }

    // 5. Страница регистрации
    else if (req.method === 'GET' && pathname.startsWith('/register.html')) {
        serveFile(res, 'register.html');
    }

    // 6. API: Получение туров с фильтрами (УПРОЩЕННАЯ ВЕРСИЯ ДЛЯ ТЕСТА)
    else if (req.method === 'GET' && pathname === '/api/tours') {
        console.log('🔄 Запрос к API туров');
        console.log('🔍 Параметры фильтров:', query);

        try {
            // Простой запрос без фильтров для теста
            const result = await pool.query('SELECT * FROM tours WHERE is_available = true LIMIT 10');
            console.log(`✅ Найдено ${result.rows.length} туров`);

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            });
            res.end(JSON.stringify(result.rows));
        } catch (err) {
            console.error('❌ Ошибка базы данных:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'Ошибка базы данных',
                details: err.message
            }));
        }
    }

    // 7. Обработка формы поиска туров
    else if (req.method === 'POST' && pathname === '/search-tour') {
        if (!currentUser) {
            res.writeHead(302, { 'Location': '/login' });
            res.end();
            return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const formData = querystring.parse(body);

            const params = new URLSearchParams();
            if (formData.from) params.append('from', formData.from);
            if (formData.to) params.append('to', formData.to);
            if (formData.transport) params.append('transport', formData.transport);
            if (formData.days) params.append('days', formData.days);

            res.writeHead(302, {
                'Location': `/results?${params.toString()}`
            });
            res.end();
        });
    }

    // 8. Обработка формы входа (ИСПРАВЛЕННАЯ ВЕРСИЯ)
    else if (req.method === 'POST' && pathname === '/login-action') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const formData = querystring.parse(body);
            console.log('Данные входа:', formData);

            try {
                const result = await pool.query(
                    'SELECT * FROM users WHERE email = $1 AND password_hash = $2',
                    [formData.email, formData.password]
                );

                if (result.rows.length > 0) {
                    const user = result.rows[0];

                    // Создаем сессию
                    const sessionToken = generateSessionToken();
                    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 часа

                    await pool.query(
                        'INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)',
                        [user.id, sessionToken, expiresAt]
                    );

                    // Устанавливаем cookie с сессией
                    res.writeHead(302, {
                        'Location': '/search',
                        'Set-Cookie': `session_token=${sessionToken}; Path=/; HttpOnly; Max-Age=86400`
                    });
                    res.end();

                } else {
                    // Неверные данные
                    res.writeHead(302, { 'Location': '/login?error=1' });
                    res.end();
                }
            } catch (err) {
                console.error('Ошибка входа:', err);
                res.writeHead(302, { 'Location': '/login?error=1' });
                res.end();
            }
        });
    }

    // 9. Обработка формы регистрации
    else if (req.method === 'POST' && pathname === '/register-action') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const formData = querystring.parse(body);
            console.log('📝 Данные регистрации:', formData);

            // Проверяем обязательные поля
            if (!formData.email || !formData.password || !formData.confirmPassword) {
                res.writeHead(302, { 'Location': '/register.html?error=empty' });
                res.end();
                return;
            }

            // Проверяем совпадение паролей
            if (formData.password !== formData.confirmPassword) {
                res.writeHead(302, { 'Location': '/register.html?error=password_mismatch' });
                res.end();
                return;
            }

            try {
                // Проверяем, нет ли уже пользователя с таким email
                const existingUser = await pool.query(
                    'SELECT id FROM users WHERE email = $1',
                    [formData.email]
                );

                if (existingUser.rows.length > 0) {
                    res.writeHead(302, { 'Location': '/register.html?error=email_exists' });
                    res.end();
                    return;
                }

                // Создаем нового пользователя
                const result = await pool.query(
                    'INSERT INTO users (email, password_hash, phone, name) VALUES ($1, $2, $3, $4) RETURNING id, email, name, phone, role',
                    [formData.email, formData.password, formData.phone || '', formData.name || '']
                );

                if (result.rows.length > 0) {
                    const user = result.rows[0];

                    // Создаем сессию для нового пользователя
                    const sessionToken = generateSessionToken();
                    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

                    await pool.query(
                        'INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)',
                        [user.id, sessionToken, expiresAt]
                    );

                    // Устанавливаем cookie и перенаправляем
                    res.writeHead(302, {
                        'Location': '/search',
                        'Set-Cookie': `session_token=${sessionToken}; Path=/; HttpOnly; Max-Age=86400`
                    });
                    res.end();

                } else {
                    res.writeHead(302, { 'Location': '/register.html?error=general' });
                    res.end();
                }
            } catch (err) {
                console.error('❌ Ошибка регистрации:', err.message);
                res.writeHead(302, { 'Location': '/register.html?error=general' });
                res.end();
            }
        });
    }

    // 10. Выход из системы
    else if (req.method === 'GET' && pathname === '/logout') {
        const cookies = parseCookies(req.headers.cookie);
        const sessionToken = cookies.session_token;

        if (sessionToken) {
            try {
                await pool.query(
                    'DELETE FROM sessions WHERE session_token = $1',
                    [sessionToken]
                );
            } catch (error) {
                console.error('Ошибка удаления сессии:', error);
            }
        }

        // Очищаем cookie и перенаправляем на главную
        res.writeHead(302, {
            'Location': '/',
            'Set-Cookie': 'session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
        });
        res.end();
    }

    // 11. Страница успешной регистрации
    else if (req.method === 'GET' && pathname === '/register-success') {
        serveFile(res, 'success_register.html');
    }

    // 12. Страница личного кабинета
    else if (req.method === 'GET' && pathname === '/account') {
        if (!currentUser) {
            res.writeHead(302, { 'Location': '/login' });
            res.end();
            return;
        }
        serveFile(res, 'account.html');
    }

    // 13. API: Получение данных текущего пользователя
    else if (req.method === 'GET' && pathname === '/api/user/current') {
        if (!currentUser) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Не авторизован' }));
            return;
        }

        // Возвращаем данные пользователя без пароля
        const userData = {
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.name || currentUser.email.split('@')[0],
            phone: currentUser.phone || '',
            role: currentUser.role || 'client'
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(userData));
    }

    // 14. API: Обновление профиля пользователя
    else if (req.method === 'PUT' && pathname === '/api/user/update') {
        if (!currentUser) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Не авторизован' }));
            return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                console.log('📝 Обновление профиля:', data);

                // Обновляем данные в базе
                const result = await pool.query(
                    'UPDATE users SET name = $1, phone = $2 WHERE id = $3 RETURNING id, email, name, phone, role',
                    [data.name, data.phone, currentUser.id]
                );

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Профиль обновлен',
                    user: result.rows[0]
                }));
            } catch (err) {
                console.error('❌ Ошибка обновления профиля:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
    }

    // 15. API: Резервирование тура (добавление в корзину)
    else if (req.method === 'POST' && pathname === '/api/reserve') {
        if (!currentUser) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Не авторизован' }));
            return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { tourId } = data;
                const userId = currentUser.id;

                console.log(`🎯 Резервирование тура ${tourId} пользователем ${userId}`);

                // Проверяем, доступен ли тур
                const tourResult = await pool.query(
                    'SELECT * FROM tours WHERE id = $1',
                    [tourId]
                );

                if (tourResult.rows.length === 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Тур не найден' }));
                    return;
                }

                // Резервируем на 15 минут
                const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

                // Создаем резервирование
                const reservationResult = await pool.query(
                    `INSERT INTO reservations (user_id, tour_id, expires_at, status)
                     VALUES ($1, $2, $3, 'reserved')
                     RETURNING id, expires_at`,
                    [userId, tourId, expiresAt]
                );

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    reservation: reservationResult.rows[0],
                    expiresAt: expiresAt
                }));

            } catch (err) {
                console.error('❌ Ошибка резервирования:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
    }

    // 16. API: Получение активных резервирований текущего пользователя
    else if (req.method === 'GET' && pathname === '/api/user/reservations') {
        if (!currentUser) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Не авторизован' }));
            return;
        }

        try {
            const result = await pool.query(
                `SELECT r.*, t.title, t.from_city, t.to_city, t.price, t.days, t.transport
                 FROM reservations r
                 JOIN tours t ON r.tour_id = t.id
                 WHERE r.user_id = $1 AND r.status = 'reserved'
                 ORDER BY r.expires_at ASC`,
                [currentUser.id]
            );

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result.rows));
        } catch (err) {
            console.error('❌ Ошибка получения резервирований:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ошибка сервера' }));
        }
    }

    // 17. API: Отмена резервирования
    else if (req.method === 'POST' && pathname === '/api/reservation/cancel') {
        if (!currentUser) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Не авторизован' }));
            return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { reservationId } = data;

                // Проверяем, принадлежит ли резервирование текущему пользователю
                const reservationCheck = await pool.query(
                    'SELECT id FROM reservations WHERE id = $1 AND user_id = $2',
                    [reservationId, currentUser.id]
                );

                if (reservationCheck.rows.length === 0) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Доступ запрещен' }));
                    return;
                }

                // Меняем статус резервирования
                await pool.query(
                    "UPDATE reservations SET status = 'cancelled' WHERE id = $1",
                    [reservationId]
                );

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));

            } catch (err) {
                console.error('❌ Ошибка отмены резервирования:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
    }

    // 18. API: Подтверждение бронирования
    else if (req.method === 'POST' && pathname === '/api/reservation/confirm') {
        if (!currentUser) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Не авторизован' }));
            return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { reservationId } = data;

                // Проверяем, принадлежит ли резервирование текущему пользователю
                const reservation = await pool.query(
                    'SELECT tour_id FROM reservations WHERE id = $1 AND user_id = $2 AND status = $3',
                    [reservationId, currentUser.id, 'reserved']
                );

                if (reservation.rows.length === 0) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Резервирование не найдено или недоступно' }));
                    return;
                }

                const tourId = reservation.rows[0].tour_id;

                // Создаем запись в booked_tours
                await pool.query(
                    `INSERT INTO booked_tours (user_id, tour_id, status)
                     VALUES ($1, $2, 'booked')`,
                    [currentUser.id, tourId]
                );

                // Меняем статус резервирования
                await pool.query(
                    "UPDATE reservations SET status = 'confirmed' WHERE id = $1",
                    [reservationId]
                );

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));

            } catch (err) {
                console.error('❌ Ошибка подтверждения бронирования:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ошибка сервера' }));
            }
        });
    }

    // 19. API: Получение подтвержденных бронирований текущего пользователя
    else if (req.method === 'GET' && pathname === '/api/user/bookings') {
        if (!currentUser) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Не авторизован' }));
            return;
        }

        try {
            const result = await pool.query(
                `SELECT b.*, t.title, t.from_city, t.to_city, t.price, t.days, t.transport
                 FROM booked_tours b
                 JOIN tours t ON b.tour_id = t.id
                 WHERE b.user_id = $1
                 ORDER BY b.booked_at DESC`,
                [currentUser.id]
            );

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result.rows));
        } catch (err) {
            console.error('❌ Ошибка получения бронирований:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ошибка сервера' }));
        }
    }

    // УНИВЕРСАЛЬНЫЙ ОБРАБОТЧИК СТАТИЧЕСКИХ ФАЙЛОВ
    else {
        const filePath = path.join(__dirname, pathname);
        const ext = path.extname(filePath);
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (pathname === '/') {
                    serveFile(res, 'main-page.html');
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end('<h1>404 - Страница не найдена</h1>');
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
    }
});

// ==================== ЗАПУСК СЕРВЕРА ====================

// Проверка подключения к БД при запуске
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.log('❌ Ошибка подключения к БД:', err.message);
    } else {
        console.log('✅ База данных подключена');
    }
});

// Запускаем очистку при старте сервера
cleanupExpiredData();

server.listen(PORT, 'localhost', () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
    console.log('Доступные маршруты:');
    console.log('  /                 - Главная страница');
    console.log('  /search           - Поиск туров (требует входа)');
    console.log('  /results          - Результаты поиска (требует входа)');
    console.log('  /login            - Вход');
    console.log('  /register.html    - Регистрация');
    console.log('  /account          - Личный кабинет (требует входа)');
    console.log('  /logout           - Выход');
    console.log('  /api/user/current - Данные текущего пользователя');
    console.log('  /api/tours        - API туров (с фильтрами)');
});