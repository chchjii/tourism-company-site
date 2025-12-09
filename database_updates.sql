-- Добавляем недостающие таблицы для резервирования и бронирования

-- Таблица резервирований (корзина)
CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tour_id INTEGER REFERENCES tours(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'reserved',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица подтвержденных бронирований
CREATE TABLE IF NOT EXISTS booked_tours (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tour_id INTEGER REFERENCES tours(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'booked',
    booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Добавляем поле is_available в таблицу tours (если его нет)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='tours' AND column_name='is_available') THEN
        ALTER TABLE tours ADD COLUMN is_available BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Добавляем поле name в таблицу users (для имени пользователя)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='users' AND column_name='name') THEN
        ALTER TABLE users ADD COLUMN name VARCHAR(100);
    END IF;
END $$;

-- Вставляем тестовые данные (если нужно)
INSERT INTO users (email, password_hash, name, phone, role) 
VALUES 
    ('admin@2rism.com', 'admin123', 'Администратор', '+375291234567', 'admin'),
    ('user@2rism.com', 'user123', 'Иван Иванов', '+375291111111', 'client')
ON CONFLICT (email) DO NOTHING;