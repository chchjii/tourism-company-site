-- ====================================================
-- ПОЛНАЯ ПЕРЕЗАПИСЬ БАЗЫ ДАННЫХ tourism_db
-- ВНИМАНИЕ: ЭТОТ СКРИПТ УДАЛИТ ВСЕ СУЩЕСТВУЮЩИЕ ДАННЫЕ!
-- ====================================================

-- Если база данных существует, пересоздаем ее
-- ВАЖНО: Выполните в терминале или pgAdmin:
-- DROP DATABASE IF EXISTS tourism_db;
-- CREATE DATABASE tourism_db;

-- Подключаемся к базе tourism_db и выполняем:

-- ==================== 1. УДАЛЕНИЕ СУЩЕСТВУЮЩИХ ТАБЛИЦ ====================
-- (Выполняется в обратном порядке из-за внешних ключей)

DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS booked_tours CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS tours CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ==================== 2. СОЗДАНИЕ ТАБЛИЦЫ ПОЛЬЗОВАТЕЛЕЙ ====================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    phone VARCHAR(20),
    role VARCHAR(20) DEFAULT 'client' CHECK (role IN ('client', 'admin')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE users IS 'Таблица пользователей системы';
COMMENT ON COLUMN users.role IS 'Роль пользователя: client - клиент, admin - администратор';

-- ==================== 3. СОЗДАНИЕ ТАБЛИЦЫ ТУРОВ ====================
CREATE TABLE tours (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    from_city VARCHAR(100) NOT NULL,
    to_city VARCHAR(100) NOT NULL,
    transport VARCHAR(50) NOT NULL CHECK (transport IN ('Самолёт', 'Поезд', 'Автобус', 'Круиз')),
    days INTEGER NOT NULL CHECK (days > 0),
    price DECIMAL(10,2) NOT NULL CHECK (price > 0),
    start_date DATE,
    end_date DATE,
    image_url VARCHAR(500),
    is_hot BOOLEAN DEFAULT false,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE tours IS 'Таблица туров';
COMMENT ON COLUMN tours.is_hot IS 'Горящий тур (спецпредложение)';
COMMENT ON COLUMN tours.is_available IS 'Доступен для бронирования (true - доступен, false - забронирован)';

-- ==================== 4. СОЗДАНИЕ ТАБЛИЦЫ РЕЗЕРВИРОВАНИЙ ====================
-- (Корзина - туры зарезервированы на 15 минут)
CREATE TABLE reservations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tour_id INTEGER REFERENCES tours(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'reserved' CHECK (status IN ('reserved', 'expired', 'cancelled')),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE reservations IS 'Таблица резервирований (корзина)';
COMMENT ON COLUMN reservations.expires_at IS 'Время истечения резервирования (резервирование на 15 минут)';

-- ==================== 5. СОЗДАНИЕ ТАБЛИЦЫ ПОДТВЕРЖДЕННЫХ БРОНИРОВАНИЙ ====================
CREATE TABLE booked_tours (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tour_id INTEGER REFERENCES tours(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'booked' CHECK (status IN ('booked', 'completed', 'cancelled')),
    guests_count INTEGER DEFAULT 1 CHECK (guests_count > 0),
    total_price DECIMAL(10,2) NOT NULL,
    booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE booked_tours IS 'Таблица подтвержденных бронирований';

-- ==================== 6. СОЗДАНИЕ ТАБЛИЦЫ СЕССИЙ ====================
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE sessions IS 'Таблица активных сессий пользователей';

-- ==================== 7. СОЗДАНИЕ ИНДЕКСОВ ДЛЯ УСКОРЕНИЯ ====================

-- Индексы для таблицы users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Индексы для таблицы tours
CREATE INDEX idx_tours_from_city ON tours(from_city);
CREATE INDEX idx_tours_to_city ON tours(to_city);
CREATE INDEX idx_tours_transport ON tours(transport);
CREATE INDEX idx_tours_price ON tours(price);
CREATE INDEX idx_tours_days ON tours(days);
CREATE INDEX idx_tours_is_hot ON tours(is_hot);
CREATE INDEX idx_tours_is_available ON tours(is_available);
CREATE INDEX idx_tours_dates ON tours(start_date, end_date);
CREATE INDEX idx_tours_search ON tours(from_city, to_city, transport, is_available);

-- Индексы для таблицы reservations
CREATE INDEX idx_reservations_user_id ON reservations(user_id);
CREATE INDEX idx_reservations_tour_id ON reservations(tour_id);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_expires_at ON reservations(expires_at);
CREATE INDEX idx_reservations_user_status ON reservations(user_id, status);

-- Индексы для таблицы booked_tours
CREATE INDEX idx_booked_tours_user_id ON booked_tours(user_id);
CREATE INDEX idx_booked_tours_status ON booked_tours(status);
CREATE INDEX idx_booked_tours_booked_at ON booked_tours(booked_at);

-- Индексы для таблицы sessions
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- ==================== 8. СОЗДАНИЕ ФУНКЦИЙ И ТРИГГЕРОВ ====================

-- Функция для автоматического обновления updated_at в booked_tours
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_booked_tours_updated_at 
    BEFORE UPDATE ON booked_tours 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Функция для проверки доступности тура при резервировании
CREATE OR REPLACE FUNCTION check_tour_availability()
RETURNS TRIGGER AS $$
BEGIN
    -- Проверяем, доступен ли тур
    IF NOT EXISTS (SELECT 1 FROM tours WHERE id = NEW.tour_id AND is_available = true) THEN
        RAISE EXCEPTION 'Тур % уже забронирован или недоступен', NEW.tour_id;
    END IF;
    
    -- Помечаем тур как недоступный
    UPDATE tours SET is_available = false WHERE id = NEW.tour_id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггер для проверки доступности при резервировании
CREATE TRIGGER check_tour_availability_on_reserve
    BEFORE INSERT ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION check_tour_availability();

-- Функция для освобождения тура при отмене резервирования
CREATE OR REPLACE FUNCTION free_tour_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
    -- Если статус меняется на cancelled или expired
    IF NEW.status IN ('cancelled', 'expired') AND OLD.status = 'reserved' THEN
        UPDATE tours SET is_available = true WHERE id = OLD.tour_id;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггер для освобождения тура
CREATE TRIGGER free_tour_on_cancel_trigger
    BEFORE UPDATE ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION free_tour_on_cancel();

-- ==================== 9. ЗАПОЛНЕНИЕ БАЗЫ ТЕСТОВЫМИ ДАННЫМИ ====================

-- Вставка тестовых пользователей
INSERT INTO users (email, password_hash, name, phone, role) VALUES
    ('admin@2rism.com', 'admin123', 'Александр Администратор', '+375291234567', 'admin'),
    ('ivanov@mail.com', 'user123', 'Иван Иванов', '+375291111111', 'client'),
    ('petrova@mail.com', 'user456', 'Мария Петрова', '+375292222222', 'client'),
    ('sidorov@mail.com', 'user789', 'Алексей Сидоров', '+375293333333', 'client'),
    ('test@test.com', 'test123', 'Тестовый Пользователь', '+375290000000', 'client');

-- Вставка туров (Самолёт)
INSERT INTO tours (title, description, from_city, to_city, transport, days, price, start_date, end_date, is_hot, is_available) VALUES
    ('Отдых в Дубае', 'Незабываемый отдых в современном мегаполисе с посещением Бурдж-Халифа и торговых центров.', 'Минск', 'Дубай', 'Самолёт', 7, 1899.99, '2024-06-15', '2024-06-22', false, true),
    ('Горящий тур в Турцию', 'Срочное предложение! Все включено на берегу Средиземного моря.', 'Минск', 'Анталья', 'Самолёт', 10, 1299.50, '2024-05-20', '2024-05-30', true, true),
    ('Экскурсия в Париж', 'Романтическое путешествие в столицу Франции с посещением Эйфелевой башни и Лувра.', 'Минск', 'Париж', 'Самолёт', 5, 1599.00, '2024-07-10', '2024-07-15', false, true),
    ('Шоппинг в Стамбуле', 'Идеальный тур для любителей шоппинга и восточной культуры.', 'Минск', 'Стамбул', 'Самолёт', 4, 899.99, '2024-08-01', '2024-08-05', false, true),
    ('Отдых на Мальдивах', 'Роскошный отдых на вилле над водой. Все включено.', 'Минск', 'Мале', 'Самолёт', 12, 3499.99, '2024-09-01', '2024-09-13', false, true),
    ('Горящая путевка в Египет', 'Срочный вылет. Красное море, дайвинг, экскурсии к пирамидам.', 'Минск', 'Хургада', 'Самолёт', 8, 1099.99, '2024-05-25', '2024-06-02', true, true),
    ('Новый год в Праге', 'Встреча Нового года в сказочной Праге с экскурсиями.', 'Минск', 'Прага', 'Самолёт', 6, 1799.50, '2024-12-28', '2025-01-03', false, true),
    ('Экзотика в Таиланде', 'Пхукет, экскурсии на острова, тайский массаж.', 'Минск', 'Пхукет', 'Самолёт', 14, 2199.99, '2024-11-10', '2024-11-24', false, true);

-- Вставка туров (Поезд)
INSERT INTO tours (title, description, from_city, to_city, transport, days, price, start_date, end_date, is_hot, is_available) VALUES
    ('Путешествие в Санкт-Петербург', 'Культурная столица России. Эрмитаж, Петергоф, речные каналы.', 'Минск', 'Санкт-Петербург', 'Поезд', 3, 299.99, '2024-06-01', '2024-06-04', false, true),
    ('Выходные в Москве', 'Красная площадь, Кремль, Третьяковская галерея.', 'Минск', 'Москва', 'Поезд', 2, 199.50, '2024-05-15', '2024-05-17', true, true),
    ('Тур по Золотому Кольцу', 'Экскурсионный тур по древним городам России.', 'Минск', 'Владимир', 'Поезд', 5, 599.99, '2024-07-20', '2024-07-25', false, true),
    ('Романтика в Вене', 'Путешествие на комфортабельном поезде в столицу Австрии.', 'Минск', 'Вена', 'Поезд', 4, 799.00, '2024-08-10', '2024-08-14', false, true),
    ('Берлин на уикенд', 'Быстрое путешествие в столицу Германии.', 'Минск', 'Берлин', 'Поезд', 3, 449.99, '2024-09-05', '2024-09-08', true, true),
    ('Варшава за 2 дня', 'Короткая поездка в столицу Польши.', 'Минск', 'Варшава', 'Поезд', 2, 149.99, '2024-05-18', '2024-05-20', false, true),
    ('Путь в Калининград', 'Тур в самый западный регион России через Литву.', 'Минск', 'Калининград', 'Поезд', 4, 399.50, '2024-07-05', '2024-07-09', false, true);

-- Вставка туров (Автобус)
INSERT INTO tours (title, description, from_city, to_city, transport, days, price, start_date, end_date, is_hot, is_available) VALUES
    ('Автобусный тур по Европе', '10 стран за 14 дней. Париж, Амстердам, Берлин, Прага и другие.', 'Минск', 'Париж', 'Автобус', 14, 1299.99, '2024-06-10', '2024-06-24', false, true),
    ('Отдых в Карпатах', 'Горы, чистый воздух, экскурсии и термальные источники.', 'Минск', 'Яремче', 'Автобус', 7, 399.99, '2024-07-15', '2024-07-22', true, true),
    ('Черное море на автобусе', 'Поездка к морю через Украину и Молдову.', 'Минск', 'Одесса', 'Автобус', 10, 499.50, '2024-08-05', '2024-08-15', false, true),
    ('Тур по Беларуси', 'Знакомство с культурным наследием страны.', 'Минск', 'Гродно', 'Автобус', 5, 199.99, '2024-05-25', '2024-05-30', false, true),
    ('Прибалтика на автобусе', 'Вильнюс, Рига, Таллин за одну поездку.', 'Минск', 'Вильнюс', 'Автобус', 6, 349.99, '2024-09-10', '2024-09-16', true, true),
    ('Польские города', 'Варшава, Краков, Вроцлав - исторический тур.', 'Минск', 'Варшава', 'Автобус', 5, 299.50, '2024-06-20', '2024-06-25', false, true),
    ('Горящий тур в Будапешт', 'Спецпредложение в столицу Венгрии.', 'Минск', 'Будапешт', 'Автобус', 4, 249.99, '2024-05-22', '2024-05-26', true, true);

-- Вставка туров (Круиз)
INSERT INTO tours (title, description, from_city, to_city, transport, days, price, start_date, end_date, is_hot, is_available) VALUES
    ('Круиз по Средиземному морю', 'Италия, Испания, Франция на круизном лайнере.', 'Генуя', 'Барселона', 'Круиз', 10, 2899.99, '2024-07-01', '2024-07-11', false, true),
    ('Северное сияние в Норвегии', 'Круиз по фьордам с возможностью увидеть северное сияние.', 'Осло', 'Берген', 'Круиз', 8, 2199.50, '2024-11-15', '2024-11-23', false, true),
    ('Карибские острова', 'Экзотический круиз по Карибскому морю.', 'Майами', 'Нассау', 'Круиз', 12, 3599.99, '2024-12-10', '2024-12-22', false, true),
    ('Греческие острова', 'Миконос, Санторини, Крит на белом лайнере.', 'Афины', 'Санторини', 'Круиз', 9, 1899.99, '2024-08-20', '2024-08-29', true, true);

-- Вставка тестовых резервирований (истекших и активных)
INSERT INTO reservations (user_id, tour_id, status, expires_at, created_at) VALUES
    (2, 1, 'reserved', NOW() + INTERVAL '15 minutes', NOW() - INTERVAL '5 minutes'),
    (3, 5, 'reserved', NOW() + INTERVAL '10 minutes', NOW() - INTERVAL '5 minutes'),
    (2, 10, 'expired', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '2 hours'),
    (3, 15, 'cancelled', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '1 hour');

-- Вставка тестовых бронирований
INSERT INTO booked_tours (user_id, tour_id, status, guests_count, total_price, booked_at) VALUES
    (2, 3, 'booked', 2, 3198.00, NOW() - INTERVAL '7 days'),
    (3, 8, 'completed', 1, 2199.99, NOW() - INTERVAL '30 days'),
    (4, 12, 'booked', 3, 1799.97, NOW() - INTERVAL '3 days'),
    (2, 20, 'cancelled', 2, 799.98, NOW() - INTERVAL '10 days');

-- Вставка тестовой сессии
INSERT INTO sessions (user_id, session_token, expires_at) VALUES
    (2, 'test_session_token_123', NOW() + INTERVAL '24 hours');

-- ==================== 10. СОЗДАНИЕ VIEW ДЛЯ УДОБСТВА ====================

-- Представление для активных резервирований
CREATE OR REPLACE VIEW active_reservations AS
SELECT 
    r.id,
    r.user_id,
    r.tour_id,
    r.status,
    r.expires_at,
    r.created_at,
    u.email as user_email,
    u.name as user_name,
    t.title as tour_title,
    t.from_city,
    t.to_city,
    t.transport,
    t.days,
    t.price
FROM reservations r
JOIN users u ON r.user_id = u.id
JOIN tours t ON r.tour_id = t.id
WHERE r.status = 'reserved'
AND r.expires_at > NOW();

-- Представление для активных бронирований
CREATE OR REPLACE VIEW active_bookings AS
SELECT 
    b.id,
    b.user_id,
    b.tour_id,
    b.status,
    b.guests_count,
    b.total_price,
    b.booked_at,
    u.email as user_email,
    u.name as user_name,
    t.title as tour_title,
    t.from_city,
    t.to_city,
    t.transport,
    t.days
FROM booked_tours b
JOIN users u ON b.user_id = u.id
JOIN tours t ON b.tour_id = t.id
WHERE b.status IN ('booked', 'completed');

-- Представление для поиска туров с фильтрами
CREATE OR REPLACE VIEW available_tours AS
SELECT 
    id,
    title,
    description,
    from_city,
    to_city,
    transport,
    days,
    price,
    start_date,
    end_date,
    is_hot,
    is_available,
    created_at
FROM tours
WHERE is_available = true
AND (start_date IS NULL OR start_date >= CURRENT_DATE);

-- ==================== 11. СОЗДАНИЕ ПРОЦЕДУР ДЛЯ ОБСЛУЖИВАНИЯ ====================

-- Процедура для очистки истекших резервирований
CREATE OR REPLACE PROCEDURE cleanup_expired_reservations()
LANGUAGE plpgsql
AS $$
BEGIN
    -- Меняем статус истекших резервирований
    UPDATE reservations 
    SET status = 'expired' 
    WHERE status = 'reserved' 
    AND expires_at <= NOW();
    
    -- Освобождаем туры
    UPDATE tours t
    SET is_available = true
    FROM reservations r
    WHERE t.id = r.tour_id
    AND r.status = 'expired'
    AND r.expires_at <= NOW();
    
    COMMIT;
END;
$$;

-- Процедура для резервирования тура
CREATE OR REPLACE PROCEDURE reserve_tour(
    p_user_id INTEGER,
    p_tour_id INTEGER,
    OUT p_reservation_id INTEGER,
    OUT p_expires_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_expires_at TIMESTAMP := NOW() + INTERVAL '15 minutes';
BEGIN
    -- Проверяем доступность тура
    IF NOT EXISTS (SELECT 1 FROM tours WHERE id = p_tour_id AND is_available = true) THEN
        RAISE EXCEPTION 'Тур уже забронирован или недоступен';
    END IF;
    
    -- Создаем резервирование
    INSERT INTO reservations (user_id, tour_id, expires_at)
    VALUES (p_user_id, p_tour_id, v_expires_at)
    RETURNING id, expires_at INTO p_reservation_id, p_expires_at;
    
    -- Помечаем тур как недоступный
    UPDATE tours SET is_available = false WHERE id = p_tour_id;
    
    COMMIT;
END;
$$;

-- ==================== 12. ГРАНТЫ И ПРАВА ====================

-- Создаем пользователя для приложения (если нужно)
-- CREATE USER tourism_app WITH PASSWORD 'secure_password';

-- Даем права
GRANT CONNECT ON DATABASE tourism_db TO PUBLIC;
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

-- ==================== 13. ИНФОРМАЦИЯ О СОЗДАННОЙ БАЗЕ ====================

-- Выводим статистику
DO $$
DECLARE
    user_count INTEGER;
    tour_count INTEGER;
    reservation_count INTEGER;
    booking_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO tour_count FROM tours;
    SELECT COUNT(*) INTO reservation_count FROM reservations;
    SELECT COUNT(*) INTO booking_count FROM booked_tours;
    
    RAISE NOTICE 'База данных успешно создана!';
    RAISE NOTICE 'Количество пользователей: %', user_count;
    RAISE NOTICE 'Количество туров: %', tour_count;
    RAISE NOTICE 'Количество резервирований: %', reservation_count;
    RAISE NOTICE 'Количество бронирований: %', booking_count;
    RAISE NOTICE ' ';
    RAISE NOTICE 'Данные для входа:';
    RAISE NOTICE 'Администратор: admin@2rism.com / admin123';
    RAISE NOTICE 'Пользователь: ivanov@mail.com / user123';
    RAISE NOTICE 'Тестовый: test@test.com / test123';
END $$;

-- ==================== 14. ТЕСТОВЫЕ ЗАПРОСЫ ДЛЯ ПРОВЕРКИ ====================

-- Пример 1: Поиск доступных туров из Минска на самолете
/*
SELECT title, to_city, transport, days, price, is_hot 
FROM tours 
WHERE from_city = 'Минск' 
AND transport = 'Самолёт' 
AND is_available = true 
ORDER BY price ASC;
*/

-- Пример 2: Получение активных резервирований пользователя
/*
SELECT r.id, t.title, t.from_city, t.to_city, t.price, r.expires_at
FROM reservations r
JOIN tours t ON r.tour_id = t.id
WHERE r.user_id = 2 
AND r.status = 'reserved'
AND r.expires_at > NOW();
*/

-- Пример 3: Получение горящих туров
/*
SELECT title, from_city, to_city, transport, days, price
FROM tours 
WHERE is_hot = true 
AND is_available = true
ORDER BY created_at DESC
LIMIT 10;
*/

-- Пример 4: Статистика по типам транспорта
/*
SELECT 
    transport,
    COUNT(*) as total_tours,
    AVG(price) as avg_price,
    MIN(price) as min_price,
    MAX(price) as max_price
FROM tours 
WHERE is_available = true
GROUP BY transport
ORDER BY total_tours DESC;
*/

-- ==================== 15. СКРИПТ ДЛЯ РЕГУЛЯРНОГО ОБСЛУЖИВАНИЯ ====================

/*
-- Для автоматической очистки истекших резервирований можно настроить cron:
-- В Linux crontab добавьте:
-- 0 * * * * psql -U postgres -d tourism_db -c "CALL cleanup_expired_reservations();"

-- Или создайте задание в pgAgent/pg_cron если доступно.
*/