const http = require('http');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

const PORT = 3000;

// Создаем небольшой объект, чтобы правильно определять Content-Type
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

    // 1. Обработка главной страницы
    if (req.method === 'GET' && req.url === '/') {
        const filePath = path.join(__dirname, 'main.html');
        fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) {
                res.writeHead(500); res.end('Ошибка сервера'); return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        });
    }

    // 2. Обработка страницы результатов
    else if (req.method === 'GET' && req.url === '/results') {
        const filePath = path.join(__dirname, 'results.html');
        fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) {
                res.writeHead(500); res.end('Ошибка сервера'); return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        });
    }

    // 3. Обработка данных формы
    else if (req.method === 'POST' && req.url === '/search-tour') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            const formData = querystring.parse(body);
            console.log('Данные из формы получены:', formData);
            res.writeHead(302, { 'Location': '/results' });
            res.end();
        });
    }

        // 4. УНИВЕРСАЛЬНЫЙ ОБРАБОТЧИК СТАТИЧЕСКИХ ФАЙЛОВ
    // (Этот код теперь обработает и /styles.css, и /tour-image.jpg, и любые другие файлы)
    else {
        const filePath = path.join(__dirname, 'public', req.url);
        const ext = path.extname(filePath); // Получаем расширение файла, например ".css"
        const contentType = mimeTypes[ext] || 'application/octet-stream'; // Находим нужный Content-Type

        fs.readFile(filePath, (err, content) => {
            if (err) {
                // Если файл в папке public не найден, отдаем 404
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>404 - Страница не найдена</h1>');
            } else {
                // Если файл найден, отдаем его с правильным Content-Type
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
    }
});

server.listen(PORT, 'localhost', () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});