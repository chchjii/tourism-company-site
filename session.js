// session.js - временное решение для работы с пользователями
// В следующем этапе заменим на полноценную аутентификацию

const sessions = new Map();

class SessionManager {
    static createSession(userId) {
        const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2);
        sessions.set(sessionId, {
            userId,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 часа
        });
        return sessionId;
    }
    
    static getSession(sessionId) {
        const session = sessions.get(sessionId);
        if (!session) return null;
        
        if (new Date() > session.expiresAt) {
            sessions.delete(sessionId);
            return null;
        }
        
        return session;
    }
    
    static deleteSession(sessionId) {
        sessions.delete(sessionId);
    }
    
    static getCurrentUserId(req) {
        // Временная заглушка - всегда возвращаем ID 1
        // В следующем этапе будем проверять куки или заголовки
        return 1;
    }
}

module.exports = SessionManager;