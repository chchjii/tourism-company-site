const http = require('http');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

const PORT = 3000;

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
    console.log(`Запрошен URL: ${req.url}, Метод: ${req.method}`);

    // 1. Главная страница
    if (req.method === 'GET' && req.url === '/') {
        const filePath = path.join(__dirname, 'main.html');
        fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) { res.writeHead(500); res.end('Ошибка сервера'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        });
    }

    // 2. Страница результатов
    else if (req.method === 'GET' && req.url === '/results') {
        const filePath = path.join(__dirname, 'results.html');
        fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) { res.writeHead(500); res.end('Ошибка сервера'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        });
    }

    // НОВЫЙ БЛОК: Страница входа
    else if (req.method === 'GET' && req.url === '/login') {
        const filePath = path.join(__dirname, 'login.html');
        fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) { res.writeHead(500); res.end('Ошибка сервера'); return; }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        });
    }

    // 3. Обработка формы поиска
    else if (req.method === 'POST' && req.url === '/search-tour') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            const formData = querystring.parse(body);
            console.log('Данные из формы поиска получены:', formData);
            res.writeHead(302, { 'Location': '/results' });
            res.end();
        });
    }

    // НОВЫЙ БЛОК: Обработка формы входа
    else if (req.method === 'POST' && req.url === '/login-action') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            const formData = querystring.parse(body);
            console.log('Данные из формы входа получены:', formData);
            // В реальном приложении здесь будет проверка пароля
            // А пока просто перенаправляем на главную
            res.writeHead(302, { 'Location': '/' });
            res.end();
        });
    }

    // 4. УНИВЕРСАЛЬНЫЙ ОБРАБОТЧИК СТАТИЧЕСКИХ ФАЙЛОВ
    else {
        const filePath = path.join(__dirname, 'public', req.url);
        const ext = path.extname(filePath);
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>404 - Страница не найдена</h1>');
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
    }
});

server.listen(PORT, 'localhost', () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});