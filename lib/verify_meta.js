const crypto = require('crypto');

/**
 * Verifica la firma SHA-256 enviada por Meta en el Webhook de mensajes regulares.
 * Requerido para cumplimiento de seguridad.
 * @param {string} rawBody - El cuerpo original de la petición (texto sin procesar).
 * @param {string} signature - El header 'X-Hub-Signature-256' recibido.
 * @returns {boolean}
 */
function verifyMetaSignature(rawBody, signature) {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const appSecret = process.env.META_APP_SECRET; // El App Secret de tu panel de Meta
  if (!appSecret) {
    console.error('[VERCEL LOG] META_APP_SECRET no está configurado.');
    return false;
  }

  const expectedHash = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const expectedSignature = `sha256=${expectedHash}`;
  
  // Usamos crypto.timingSafeEqual para prevenir ataques de timing (ISO 27001)
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

module.exports = { verifyMetaSignature };