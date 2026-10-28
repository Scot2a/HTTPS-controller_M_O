const { sendTextMessage } = require('./meta_client');

const FALLBACK_ADVISOR_PHONE = "+34614483775";
const FALLBACK_ADVISOR_EMAIL = "atencionalcliente@murarteglobal.com";

/**
 * Notifica a un agente humano sobre un lead que requiere atención.
 * @param {string} clientPhone Teléfono del cliente.
 * @param {object} clientData Datos opcionales del cliente.
 * @param {string} lastMessage Último texto enviado o contexto del evento.
 */
async function notifyHumanAgent(clientPhone, clientData = {}, lastMessage = '') {
  const advisorPhone = process.env.ADVISOR_PHONE_NUMBER || FALLBACK_ADVISOR_PHONE;

  if (!advisorPhone) {
    console.warn('[VERCEL LOG] ADVISOR_PHONE_NUMBER no está configurado en las variables de entorno.');
    return { success: false, error: "No advisor phone available" };
  }

  const firstName = clientData.nombre || clientData.nombre_cliente || '';
  const lastName = clientData.apellido || clientData.apellido_cliente || '';
  
  const fullName = (firstName || lastName) 
    ? `${firstName} ${lastName}`.trim() 
    : 'Anónimo';

  const alertMessage = `🚨 *Nuevo Lead Requiere Atención Humana*\n\n` +
    `• *Cliente:* ${fullName}\n` +
    `• *Teléfono:* wa.me/${clientPhone}\n` +
    (lastMessage ? `• *Último mensaje/Contexto:* "${lastMessage}"` : `• *Origen:* Solicitud directa de asesor`) +
    `\n\n_Canal de respaldo:_ ${FALLBACK_ADVISOR_EMAIL}`;
  
  try {
    // Usamos sendTextMessage que ya está validada y exportada en meta_client
    const response = await sendTextMessage(advisorPhone, alertMessage);

    console.log(`[VERCEL LOG] Alerta enviada con éxito al asesor (${advisorPhone})`);
    return { success: true, response };

  } catch (error) {
    console.error('[VERCEL LOG] Error al disparar la notificación al asesor por Meta API:', error);
    
    return { 
      success: false, 
      error: error.message,
      fallbackContact: {
        phone: advisorPhone,
        email: FALLBACK_ADVISOR_EMAIL
      }
    };
  }
}

module.exports = { notifyHumanAgent };