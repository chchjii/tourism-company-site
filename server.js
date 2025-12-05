const http = require('http');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const { Pool } = require('pg');
const url = require('url');

const PORT = 3002;

//"C:\Users\User\Desktop\tourism\server.js"

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
    } else {
        console.log(`  ✗ minPrice: пусто или undefined`);
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
    } else {
        console.log(`  ✗ maxPrice: пусто или undefined`);
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
    } else {
        console.log(`  ✗ minDays: пусто или undefined`);
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
    } else {
        console.log(`  ✗ maxDays: пусто или undefined`);
    }

    // Фильтр по горящим турам
    if (filters.hot_tours === 'hot_only') {
        console.log(`  ✓ hot_tours: только горящие`);
        sql += ` AND is_hot = true`;
    } else {
        console.log(`  ✗ hot_tours: все туры (${filters.hot_tours})`);
    }

    // Определяем порядок сортировки
    const orderBy = [];
    
    // Сортировка по длине
    if (filters.sort_days === 'days_asc') {
        console.log(`  ✓ sort_days: по возрастанию длины`);
        orderBy.push('days ASC');
    } else if (filters.sort_days === 'days_desc') {
        console.log(`  ✓ sort_days: по убыванию длины`);
        orderBy.push('days DESC');
    } else {
        console.log(`  ✗ sort_days: все туры (${filters.sort_days})`);
    }
    
    // Сортировка по цене
    if (filters.sort_price === 'price_asc') {
        console.log(`  ✓ sort_price: по возрастанию цены`);
        orderBy.push('price ASC');
    } else if (filters.sort_price === 'price_desc') {
        console.log(`  ✓ sort_price: по убыванию цены`);
        orderBy.push('price DESC');
    } else {
        console.log(`  ✗ sort_price: ${filters.sort_price}`);
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
const server = http.createServer(async (req, res) => {
    console.log(`Запрошен URL: ${req.url}, Метод: ${req.method}`);

    // Парсим URL для получения query параметров
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // 1. Главная страница
    if (req.method === 'GET' && pathname === '/') {
        serveFile(res, 'main-page.html');
    }

    // 2. Страница поиска
    else if (req.method === 'GET' && pathname === '/search') {
        serveFile(res, 'main.html');
    }

    // 3. Страница результатов
    else if (req.method === 'GET' && pathname === '/results') {
        serveFile(res, 'results.html');
    }

    // 4. Страница входа
    else if (req.method === 'GET' && pathname.startsWith('/login')) {
        serveFile(res, 'login.html');
    }

    // 5. Страница регистрации
    else if (req.method === 'GET' && pathname.startsWith('/register.html')) {
        serveFile(res, 'register.html');
    }

    // 6. API: Получение туров с фильтрами
    else if (req.method === 'GET' && pathname === '/api/tours') {
    console.log('🔄 Запрос к API туров');
    console.log('🔍 Параметры фильтров:', query);
    console.log('📊 Количество параметров:', Object.keys(query).length);
    
    try {
        const { sql, params } = buildToursQuery(query);
        
        console.log('📝 Выполняем SQL запрос:', sql);
        console.log('📦 Параметры SQL:', params);
        
        const result = await pool.query(sql, params);
        console.log(`✅ Найдено ${result.rows.length} туров`);
        
        // Логируем первые 2 тура для проверки
        if (result.rows.length > 0) {
            console.log('📋 Примеры найденных туров:');
            result.rows.slice(0, 2).forEach((tour, i) => {
                console.log(`  ${i+1}. ${tour.from_city} → ${tour.to_city}, ${tour.price} BYN, ${tour.days} дней`);
            });
        }
        
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        });
        res.end(JSON.stringify(result.rows));
    } catch (err) {
        console.error('❌ Ошибка базы данных:', err.message);
        console.error('Полный стек ошибки:', err.stack);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            error: 'Ошибка базы данных', 
            details: err.message 
        }));
    }
}

    // 7. Обработка формы поиска туров
    else if (req.method === 'POST' && pathname === '/search-tour') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            const formData = querystring.parse(body);
            console.log('Данные из формы поиска:', formData);

            // Формируем URL с параметрами для результатов
            const params = new URLSearchParams();
            if (formData.from) params.append('from', formData.from);
            if (formData.to) params.append('to', formData.to);
            if (formData.transport && formData.transport !== 'Самолёт') {
                params.append('transport', formData.transport);
            }
            if (formData.days) params.append('days', formData.days);

            res.writeHead(302, {
                'Location': `/results?${params.toString()}`
            });
            res.end();
        });
    }

    // 8. Обработка формы входа
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
                    // Успешный вход - перенаправляем на страницу поиска
                    res.writeHead(302, {
                        'Location': '/search',
                        'Set-Cookie': `user=${formData.email}; Path=/`
                    });
                } else {
                    // Неверные данные - редирект с ошибкой
                    res.writeHead(302, { 'Location': '/login?error=1' });
                }
            } catch (err) {
                console.error('Ошибка входа:', err);
                res.writeHead(302, { 'Location': '/login?error=1' });
            }
            res.end();
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
                console.log('❌ Не все обязательные поля заполнены');
                res.writeHead(302, { 'Location': '/register.html?error=empty' });
                res.end();
                return;
            }

            // Проверяем совпадение паролей
            if (formData.password !== formData.confirmPassword) {
                console.log('❌ Пароли не совпадают');
                res.writeHead(302, { 'Location': '/register.html?error=password_mismatch' });
                res.end();
                return;
            }

            try {
                // Проверяем, нет ли уже пользователя с таким email
                const existingUserByEmail = await pool.query(
                    'SELECT * FROM users WHERE email = $1',
                    [formData.email]
                );

                if (existingUserByEmail.rows.length > 0) {
                    console.log('❌ Пользователь с таким email уже существует');
                    res.writeHead(302, { 'Location': '/register.html?error=email_exists' });
                    res.end();
                    return;
                }

                // Проверяем, нет ли уже пользователя с таким телефоном (если телефон указан)
                if (formData.phone && formData.phone.trim() !== '') {
                    const existingUserByPhone = await pool.query(
                        'SELECT * FROM users WHERE phone = $1',
                        [formData.phone]
                    );

                    if (existingUserByPhone.rows.length > 0) {
                        console.log('❌ Пользователь с таким телефоном уже существует');
                        res.writeHead(302, { 'Location': '/register.html?error=phone_exists' });
                        res.end();
                        return;
                    }
                }

                // Создаем нового пользователя
                const result = await pool.query(
                    'INSERT INTO users (email, password_hash, phone) VALUES ($1, $2, $3) RETURNING id',
                    [formData.email, formData.password, formData.phone || '']
                );

                if (result.rows.length > 0) {
                    console.log('✅ Пользователь зарегистрирован, ID:', result.rows[0].id);
                    res.writeHead(302, { 'Location': '/register-success' });
                } else {
                    console.log('❌ Не удалось создать пользователя');
                    res.writeHead(302, { 'Location': '/register.html?error=general' });
                }
            } catch (err) {
                console.error('❌ Ошибка регистрации:', err.message);
                res.writeHead(302, { 'Location': '/register.html?error=general' });
            }
            res.end();
        });
    }

    // 10. Страница успешной регистрации
    else if (req.method === 'GET' && pathname === '/register-success') {
        serveFile(res, 'success_register.html');
    }

    // 11. УНИВЕРСАЛЬНЫЙ ОБРАБОТЧИК СТАТИЧЕСКИХ ФАЙЛОВ
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

// Проверка подключения к БД при запуске
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.log('❌ Ошибка подключения к БД:', err.message);
    } else {
        console.log('✅ База данных подключена');
    }
});

server.listen(PORT, 'localhost', () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
    console.log('Доступные маршруты:');
    console.log('  /                 - Главная страница');
    console.log('  /search           - Поиск туров');
    console.log('  /results          - Результаты поиска с фильтрами');
    console.log('  /login            - Вход');
    console.log('  /register.html    - Регистрация');
    console.log('  /api/tours        - API туров (с фильтрами)');
});