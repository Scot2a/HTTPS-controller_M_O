const crypto = require('crypto');

/**
 * Valida la firma HMAC-SHA256 enviada por Tally para asegurar la integridad de la petición.
 */
function verifyTallySignature(reqBody, receivedSignature, secret) {
  if (!receivedSignature || !secret) return false;

  // Tally calcula el HMAC sobre el JSON del body usando el signing secret en base64
  const calculatedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(reqBody))
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedSignature),
      Buffer.from(calculatedSignature)
    );
  } catch (err) {
    return false;
  }
}

/**
 * Función accesora para extraer el valor real de un campo de Tally.
 * Si el tipo es MULTIPLE_CHOICE, resuelve el UUID del valor contra las opciones y retorna el texto humano.
 */
function getFieldValue(fields, questionKey) {
  if (!Array.isArray(fields)) return null;

  const field = fields.find((f) => f.key === questionKey);
  if (!field) return null;

  if (field.type === 'MULTIPLE_CHOICE') {
    if (!field.value || !Array.isArray(field.value) || field.value.length === 0) {
      return null;
    }
    const selectedId = field.value[0];
    const option = Array.isArray(field.options)
      ? field.options.find((opt) => opt.id === selectedId)
      : null;
    return option ? option.text : null;
  }

  return field.value || null;
}

/**
 * Obtiene o crea un registro de UTM en Odoo (método extraído de flows.js)
 */
async function getOrCreateUtmId(model, name) {
  if (!name) return false;
  const odooUrl = `${process.env.ODOO_URL}/jsonrpc`;

  const searchBody = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [
        process.env.ODOO_DB,
        parseInt(process.env.ODOO_UID),
        process.env.ODOO_API_KEY,
        model,
        "search",
        [[["name", "=", name]]],
        { limit: 1 }
      ]
    }
  };

  try {
    let response = await fetch(odooUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchBody)
    });
    let data = await response.json();

    if (data.result && data.result.length > 0) {
      return data.result[0];
    }

    const createBody = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        service: "object",
        method: "execute_kw",
        args: [
          process.env.ODOO_DB,
          parseInt(process.env.ODOO_UID),
          process.env.ODOO_API_KEY,
          model,
          "create",
          [{ name: name }]
        ]
      }
    };

    response = await fetch(odooUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createBody)
    });
    data = await response.json();
    return data.result;

  } catch (error) {
    console.error(`[VERCEL LOG] Error procesando UTM (${model}):`, error.message);
    return false;
  }
}

/**
 * Envía el lead/oportunidad a Odoo CRM mediante JSON-RPC
 */
async function enviarLeadAOdoo(payload) {
  const odooUrl = `${process.env.ODOO_URL}/jsonrpc`;

  const rpcBody = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: "object",
      method: "execute_kw",
      args: [
        process.env.ODOO_DB,
        parseInt(process.env.ODOO_UID),
        process.env.ODOO_API_KEY,
        "crm.lead",
        "create",
        [payload]
      ]
    }
  };

  const response = await fetch(odooUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rpcBody)
  });

  if (!response.ok) throw new Error(`Fallo HTTP: ${response.status}`);
  const data = await response.json();
  if (data.error) {
    const odooDebug = data.error.data ? data.error.data.message : "Error desconocido";
    console.error("[VERCEL LOG] Error retornado por Odoo:", JSON.stringify(data.error));
    throw new Error(`Odoo rechazó la estructura. Causa: ${odooDebug}`);
  }

  return data.result;
}

module.exports = async function handler(req, res) {
  console.log(`[VERCEL LOG] Webhook Tally recibido - Método: ${req.method}`);

  if (req.method === 'GET' || req.method === 'OPTIONS') {
    return res.status(200).send("Endpoint Tally activo");
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const receivedSignature = req.headers['tally-signature'];
    const signingSecret = process.env.TALLY_SIGNING_SECRET;

    // 1. Verificación de seguridad HMAC (Cumplimiento ISO 27001)
    if (!verifyTallySignature(req.body, receivedSignature, signingSecret)) {
      console.warn("[VERCEL LOG] Intento de petición con firma HMAC de Tally inválida.");
      return res.status(401).json({ error: "Firma inválida." });
    }

    const { data } = req.body;
    if (!data || !data.fields) {
      return res.status(400).json({ error: "Payload no contiene datos o estructura 'fields'." });
    }

    const fields = data.fields;

    // Normalizador por si existen variaciones de tildes o caracteres tipográficos desde Tally
    const mapNormalizar = {
      "Despuès": "Después" // Corrige la tilde grave del payload recibido en Tally
    };

    const getCleanValue = (key) => {
      const val = getFieldValue(fields, key);
      return mapNormalizar[val] || val;
    };

    // 2. Mapeo de campos desde Tally
    const nombre = getFieldValue(fields, "question_ex6qYk") || "";
    const apellido = getFieldValue(fields, "question_WpNOjv") || "";
    const telefono = getFieldValue(fields, "question_llygqB") || "";
    const email = getFieldValue(fields, "question_XBDxzY") || "";

    const compraPost = getCleanValue("question_RB02dd");
    const tipoVehiculo = getCleanValue("question_oVygDe");
    const vehiculoPrevio = getCleanValue("question_b475vZ");
    const esTitular = getCleanValue("question_GBzkKp");
    const mismoTitular = getCleanValue("question_OBzrl7");
    const estadoVenta = getCleanValue("question_V10qjJ");
    const esConviviente = getCleanValue("question_PB64D5");
    const momentoCompra = getCleanValue("question_EbXA5X");
    const menos3Meses = getCleanValue("question_rr6gBl");
    const menos6Meses = getCleanValue("question_4N8EBk");
    const metodoContacto = getCleanValue("question_j9ygbx");

    // 3. Resolución de UTMs en Odoo
    const idSource = await getOrCreateUtmId("utm.source", "Tally");
    const idMedium = await getOrCreateUtmId("utm.medium", "Formulario Tally");
    const idCampaign = await getOrCreateUtmId("utm.campaign", "Campaña TRA050P");

    // 4. Construcción del payload para crm.lead
    const leadPayload = {
      name: `Campaña CAE - ${nombre} ${apellido}`.trim() || "Campaña de renovación de Vehículo eléctrico",
      type: "opportunity",
      x_studio_lead_name: nombre,
      x_studio_lead_lastname: apellido,
      email_from: email,
      phone: telefono,
      x_studio_bought_post: compraPost,
      x_studio_tipo: tipoVehiculo,
      x_studio_vehiculo_anterior: vehiculoPrevio,
      x_studio_titular: esTitular,
      x_studio_mismo_titular: mismoTitular,
      x_studio_venta_baja: estadoVenta,
      x_studio_es_conviviente: esConviviente,
      x_studio_momento: momentoCompra,
      x_studio_menos_3_meses: menos3Meses,
      x_studio_menos_6_meses: menos6Meses,
      x_studio_modo_de_contacto: metodoContacto,

      // Asignación de Many2one
      x_studio_source_origin: idSource || false,
      x_studio_medium_origin: idMedium || false,
      x_studio_campaign_origin: idCampaign || false
    };

    // Log higienizado para GDPR (sin PII)
    console.log(`[VERCEL LOG] Procesando submissionId (${data.submissionId}) de Tally hacia Odoo CRM...`);

    const leadId = await enviarLeadAOdoo(leadPayload);

    return res.status(200).json({
      success: true,
      message: "Lead registrado exitosamente en Odoo",
      lead_id: leadId
    });

  } catch (error) {
    console.error("[VERCEL LOG] Error procesando webhook de Tally:", error.message);
    return res.status(500).json({ error: "Error interno en el middleware" });
  }
};
