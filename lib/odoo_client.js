/**
 * Actualiza campos personalizados en un CRM Lead de Odoo utilizando la API JSON-RPC oficial.
 * @param {number|string} leadId ID del lead en Odoo
 * @param {Object} updateData Objeto con los campos a actualizar (ej. { x_studio_proceso_landing: 'Sí' })
 */
async function updateOdooLead(leadId, updateData) {
  const odooUrl = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const uid = process.env.ODOO_UID ? parseInt(process.env.ODOO_UID, 10) : null;
  const apiKey = process.env.ODOO_API_KEY;

  if (!odooUrl || !db || !uid || !apiKey || !leadId) {
    console.warn('[VERCEL LOG] Faltan credenciales de Odoo en el entorno o el leadId es nulo. Se omite la actualización.');
    return;
  }

  try {
    const response = await fetch(`${odooUrl}/jsonrpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            uid,
            apiKey,
            'crm.lead',
            'write',
            [[parseInt(leadId, 10)], updateData] // [ID del registro, { campo: valor }]
          ]
        },
        id: Math.floor(Math.random() * 1000000)
      })
    });

    const result = await response.json();

    if (result.error) {
      console.error('[VERCEL LOG] Error devuelto por Odoo al actualizar:', result.error);
    } else {
      console.log(`[VERCEL LOG] Lead de Odoo (ID: ${leadId}) actualizado con éxito:`, updateData);
    }

    return result;

  } catch (error) {
    console.error('[VERCEL LOG] Error de red o conexión al intentar actualizar Odoo:', error);
  }
}

module.exports = { updateOdooLead };