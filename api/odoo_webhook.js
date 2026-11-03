const { sendTemplateMessage } = require('../lib/meta_client');
const { getChatSession, saveChatSession } = require('../lib/redis_client'); // Importamos Redis para guardar el leadId y el estado

export const config = {
  api: {
    bodyParser: true, 
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Validación de seguridad con el token
    const odooSecret = req.headers['x-odoo-secret'] || req.query.secret;
    if (process.env.ODOO_WEBHOOK_SECRET && odooSecret !== process.env.ODOO_WEBHOOK_SECRET) {
      console.error('[VERCEL LOG] Alerta: Intento de acceso no autorizado al webhook de Odoo.');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body;
    console.log("[VERCEL LOG] Solicitud de plantilla recibida desde Odoo:", JSON.stringify(payload));

    const recipientPhone = payload.phone || payload.mobile || payload.partner_phone;
    const leadId = payload.id; // 👈 Capturamos el ID del lead en Odoo
    
    // Mapeamos el nombre de la plantilla al campo personalizado de Odoo que mencionas
    const templateName = payload.x_studio_wha_plantillas || payload.template_name; 
    const languageCode = payload.language_code || 'es_ES';

    if (!recipientPhone || !templateName) {
      console.error('[VERCEL LOG] Error: Faltan parámetros obligatorios (phone o plantilla). Payload:', payload);
      return res.status(400).json({ error: 'Faltan parámetros obligatorios: se requiere el teléfono y la plantilla asignada.' });
    }

    // Usamos 'let' para permitir la reasignación del array de componentes
    let templateComponents = payload.components || [];
    
    if (templateComponents.length === 0 && payload.x_studio_lead_name) {
      const leadName = payload.x_studio_lead_name.trim();
      
      if (templateName === 'cae_calificado') {
        // CAE Calificado lleva el parámetro en el HEADER
        templateComponents = [
          {
            type: 'header',
            parameters: [
              {
                type: 'text',
                parameter_name: 'order_id',
                text: leadName
              }
            ]
          }
        ];
      } else if (templateName === 'cae_no_calificado' || templateName === 'lead_proceso_landing') {
        // Tanto CAE No Calificado como lead_proceso_landing llevan el parámetro en el BODY
        templateComponents = [
          {
            type: 'body',
            parameters: [
              {
                type: 'text',
                parameter_name: 'order_id',
                text: leadName
              }
            ]
          }
        ];
      }
    }

    // Despacho de la plantilla a través de Meta
    await sendTemplateMessage(recipientPhone, templateName, languageCode, templateComponents);

    // 💡 REGISTRO EN REDIS: Guardamos el leadId y activamos el estado de seguimiento si es la plantilla de la landing
    try {
      const session = await getChatSession(recipientPhone);
      session.leadId = leadId || session.leadId;
      
      if (templateName === 'lead_proceso_landing') {
        session.state = 'AWAITING_LANDING_RESPONSE'; // Indicamos que esperamos que el usuario pulse Sí o No
      }

      session.history.push({ role: 'assistant', content: `[SISTEMA - Plantilla '${templateName}' enviada desde Odoo]` });
      await saveChatSession(recipientPhone, session);
    } catch (redisError) {
      console.warn('[VERCEL LOG] Advertencia: No se pudo actualizar el estado en Redis desde Odoo:', redisError.message);
    }

    console.log(`[VERCEL LOG] Plantilla '${templateName}' enviada exitosamente a ${recipientPhone} vía Odoo Bridge.`);
    
    return res.status(200).json({ success: true, message: 'Plantilla despachada correctamente a Meta' });

  } catch (error) {
    console.error('[VERCEL LOG] Error procesando la salida de Odoo:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};