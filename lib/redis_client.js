const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const TTL_SECONDS = 600; // 10 minutos de memoria a corto plazo

/**
 * Obtiene el historial de mensajes previos del usuario.
 * @param {string} phone Número de teléfono del lead
 * @returns {Array} Array de mensajes en formato [{ role: 'user'|'assistant', content: '...' }]
 */
async function getChatHistory(phone) {
  try {
    const history = await redis.get(`chat:${phone}`);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('[REDIS] Error obteniendo historial:', error);
    return [];
  }
}

/**
 * Guarda el historial actualizado y renueva el tiempo de vida (TTL).
 * @param {string} phone Número de teléfono del lead
 * @param {Array} history Array actualizado de mensajes
 */
async function saveChatHistory(phone, history) {
  try {
    // Limitamos el historial a los últimos 10 mensajes para no saturar tokens ni memoria
    const trimmedHistory = history.slice(-10);
    await redis.set(`chat:${phone}`, JSON.stringify(trimmedHistory), { ex: TTL_SECONDS });
  } catch (error) {
    console.error('[REDIS] Error guardando historial:', error);
  }
}

module.exports = { getChatHistory, saveChatHistory };