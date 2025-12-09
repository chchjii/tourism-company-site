
function startTimer(element, expiresAt) {
    function update() {
        const now = new Date();
        const diff = expiresAt - now;
        
        if (diff <= 0) {
            element.textContent = 'Время истекло';
            // Можно добавить автоматическое обновление статуса
            return;
        }
        
        const minutes = Math.floor(diff / 1000 / 60);
        const seconds = Math.floor((diff / 1000) % 60);
        
        element.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        setTimeout(update, 1000);
    }
    
    update();
}