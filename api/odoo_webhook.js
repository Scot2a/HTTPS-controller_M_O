const { sendTemplateMessage } = require('../lib/meta_client');

export const config = {
  api: {
    bodyParser: true, // Odoo envía JSON estándar, por lo que permitimos el parser
  },
};

module.exports = async function handler(req, res) {
  // Odoo se comunica mediante peticiones POST desde sus acciones automatizadas
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Validación de seguridad reutilizando tu token de Meta para evitar accesos indebidos
    const odooSecret = req.headers['x-odoo-secret'] || req.query.secret;
    if (process.env.META_VERIFY_TOKEN && odooSecret !== process.env.META_VERIFY_TOKEN) {
      console.error('[VERCEL LOG] Alerta: Intento de acceso no autorizado al webhook de Odoo.');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body;
    console.log("[VERCEL LOG] Solicitud de plantilla recibida desde Odoo:", JSON.stringify(payload));

    // 2. Extraer los datos enviados por la regla automatizada de Odoo
    const recipientPhone = payload.phone || payload.partner_phone || payload.mobile;
    const templateName = payload.template_name; // Ej: 'lead_calificado' o 'lead_descalificado'
    const languageCode = payload.language_code || 'es';
    const templateComponents = payload.components || [];

    if (!recipientPhone || !templateName) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios: phone o template_name' });
    }

    // 3. Vercel actúa como pasarela y despacha la plantilla a través de la Cloud API de Meta
    await sendTemplateMessage(recipientPhone, templateName, languageCode, templateComponents);

    console.log(`[VERCEL LOG] Plantilla '${templateName}' enviada exitosamente a ${recipientPhone} vía Odoo Bridge.`);
    
    return res.status(200).json({ success: true, message: 'Plantilla despachada correctamente a Meta' });

  } catch (error) {
    console.error('[VERCEL LOG] Error procesando la salida de Odoo:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};