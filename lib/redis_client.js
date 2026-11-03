const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const TTL_SHORT = 600;       // 10 minutos de memoria a corto plazo para chat normal
const TTL_FOLLOWUP = 86400;  // 24 horas para esperar la respuesta de la landing

/**
 * Obtiene la sesión completa del usuario (Historial + Estado + Lead ID de Odoo).
 * @param {string} phone Número de teléfono del lead
 * @returns {Object} { history: Array, state: String, leadId: Number|String|null }
 */
async function getChatSession(phone) {
  try {
    const rawData = await redis.get(`chat:${phone}`);
    if (!rawData) {
      return { history: [], state: 'IDLE', leadId: null };
    }
    
    const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

    // Retrocompatibilidad: Si en Redis todavía hay un array plano antiguo, lo convertimos a objeto de sesión
    if (Array.isArray(parsed)) {
      return { history: parsed, state: 'IDLE', leadId: null };
    }

    return parsed; // Devuelve el objeto completo { history, state, leadId }
  } catch (error) {
    console.error('[REDIS] Error obteniendo sesión:', error);
    return { history: [], state: 'IDLE', leadId: null };
  }
}

/**
 * Guarda la sesión completa del usuario, ajustando el TTL inteligentemente.
 * @param {string} phone Número de teléfono del lead
 * @param {Object} sessionData Objeto con { history, state, leadId }
 */
async function saveChatSession(phone, sessionData) {
  try {
    // Limitamos el historial a los últimos 10 mensajes para optimizar espacio y tokens
    if (sessionData.history && Array.isArray(sessionData.history)) {
      sessionData.history = sessionData.history.slice(-10);
    }

    // Si el usuario está en medio de un flujo de seguimiento (ej. esperando respuesta de landing), 
    // le damos 24 horas de vida. Si está libre, expira en 10 minutos.
    const activeTTL = (sessionData.state && sessionData.state !== 'IDLE') ? TTL_FOLLOWUP : TTL_SHORT;

    await redis.set(`chat:${phone}`, JSON.stringify(sessionData), { ex: activeTTL });
  } catch (error) {
    console.error('[REDIS] Error guardando sesión:', error);
  }
}

module.exports = { getChatSession, saveChatSession };