const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const TTL_SECONDS = 600; // 10 minutos de memoria a corto plazo

/**
 * Obtiene el historial de mensajes previos del usuario.
 */
async function getChatHistory(phone) {
  try {
    const history = await redis.get(`chat:${phone}`);
    if (!history) return [];
    
    // Upstash ya deserializa JSON automáticamente. Si es un string, lo parseamos; si ya es objeto/array, lo retornamos directo.
    return typeof history === 'string' ? JSON.parse(history) : history;
  } catch (error) {
    console.error('[REDIS] Error obteniendo historial:', error);
    return [];
  }
}

/**
 * Guarda el historial actualizado y renueva el tiempo de vida (TTL).
 */
async function saveChatHistory(phone, history) {
  try {
    const trimmedHistory = history.slice(-10);
    await redis.set(`chat:${phone}`, JSON.stringify(trimmedHistory), { ex: TTL_SECONDS });
  } catch (error) {
    console.error('[REDIS] Error guardando historial:', error);
  }
}

module.exports = { getChatHistory, saveChatHistory };