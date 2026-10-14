const { metaFetch } = require('./meta_client');

/**
 * Notifica a un agente humano sobre un lead que requiere atención.
 * @param {string} clientPhone Teléfono del cliente.
 * @param {object} clientData Datos opcionales del cliente o del formulario (ej. { nombre: 'Juan', apellido: 'Pérez' }).
 * @param {string} lastMessage Último texto enviado o contexto del evento.
 */
async function notifyHumanAgent(clientPhone, clientData = {}, lastMessage = '') {
  const advisorPhone = process.env.ADVISOR_PHONE_NUMBER;

  if (!advisorPhone) {
    console.warn('[VERCEL LOG] ADVISOR_PHONE_NUMBER no está configurado en las variables de entorno.');
    return;
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
    (lastMessage ? `• *Último mensaje/Contexto:* "${lastMessage}"` : `• *Origen:* Solicitud directa de asesor`);

  // Envía la notificación directamente al número del agente
  return metaFetch({
    messaging_product: 'whatsapp',
    to: advisorPhone,
    type: 'text',
    text: { body: alertMessage }
  });
}

module.exports = { notifyHumanAgent };