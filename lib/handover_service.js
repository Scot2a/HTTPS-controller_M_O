const { success } = require('zod');
const { metaFetch } = require('./meta_client');

const FALLBACK_ADVISOR_PHONE = "+584241456721";
const FALLBACK_ADVISOR_EMAIL = "atencionalcliente@murarteglobal.com";
/**
 * Notifica a un agente humano sobre un lead que requiere atención.
 * @param {string} clientPhone Teléfono del cliente.
 * @param {object} clientData Datos opcionales del cliente o del formulario (ej. { nombre: 'Juan', apellido: 'Pérez' }).
 * @param {string} lastMessage Último texto enviado o contexto del evento.
 */
async function notifyHumanAgent(clientPhone, clientData = {}, lastMessage = '') {
  const advisorPhone = process.env.ADVISOR_PHONE_NUMBER || FALLBACK_ADVISOR_PHONE;

  if (!advisorPhone) {
    console.warn('[VERCEL LOG] ADVISOR_PHONE_NUMBER no está configurado en las variables de entorno y el fallback no esta disponible.');
    return {success: false, error: "No advisor phone available"};
  }

  // Resolver el nombre de forma segura: busca en distintas variantes de campos de formulario o usa 'Anónimo'
  const firstName = clientData.nombre || clientData.nombre_cliente || '';
  const lastName = clientData.apellido || clientData.apellido_cliente || '';
  
  const fullName = (firstName || lastName) 
    ? `${firstName} ${lastName}`.trim() 
    : 'Anónimo';

  // Construir el mensaje de alerta limpio
  const alertMessage = `🚨 *Nuevo Lead Requiere Atención Humana*\n\n` +
    `• *Cliente:* ${fullName}\n` +
    `• *Teléfono:* wa.me/${clientPhone}\n` +
    (lastMessage ? `• *Último mensaje/Contexto:* "${lastMessage}"` : `• *Origen:* Solicitud directa de asesor`) +
    `\n\n_Canal de respaldo:_ ${FALLBACK_ADVISOR_EMAIL}`;
  
  try {
    // Envía la notificación directamente al número del agente (usando entorno o respaldo)
    const response = await metaFetch({
      messaging_product: 'whatsapp',
      to: advisorPhone,
      type: 'text',
      text: { body: alertMessage }
    });

    console.log(`[VERCEL LOG] Alerta enviada con éxito al asesor (${advisorPhone})`);
    return { success: true, response };

  } catch (error) {
    console.error('[VERCEL LOG] Error al disparar la notificación por Meta API:', error);
    
    // ante fallo de la API de Meta retornamos los datos para que el bot pueda dárselos al usuario como alternativa
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