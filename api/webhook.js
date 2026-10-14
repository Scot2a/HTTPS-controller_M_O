const { verifyMetaSignature } = require('../lib/verify_meta');
const { sendTextMessage, sendFlowMessage } = require('../lib/meta_client');
const { generateSafeResponse } = require('../lib/ai_service');
const { notifyHumanAgent } = require('../lib/handover_service');

// IMPORTANTE: Desactivar el body parser automático de Vercel para capturar el buffer crudo (Raw Body)
export const config = {
  api: {
    bodyParser: false,
  },
};

// Función auxiliar para leer el stream crudo de la petición
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('error', err => {
      reject(err);
    });
  });
}

// Función auxiliar para parsear los query params en peticiones GET (ya que bodyParser está en false)
function parseQueryParams(req) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const query = {};
  for (const [key, value] of url.searchParams.entries()) {
    query[key] = value;
  }
  return query;
}

module.exports = async function handler(req, res) {
  // 1. VERIFICACIÓN GET (Requerida por Meta al registrar el Webhook)
  if (req.method === 'GET') {
    const query = parseQueryParams(req);
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      console.log('[VERCEL LOG] Webhook de Meta verificado con éxito.');
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden: Token de verificación inválido.');
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    // 2. OBTENER EL RAW BODY Y VALIDAR LA FIRMA DE META (Criterio ISO 27001)
    const rawBody = await getRawBody(req);
    const signature = req.headers['x-hub-signature-256'];

    if (!verifyMetaSignature(rawBody, signature)) {
      console.error('[VERCEL LOG] Alerta de seguridad: Firma criptográfica rechazada.');
      return res.status(401).send('Unauthorized: Invalid Signature');
    }

    const body = JSON.parse(rawBody);
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    // Si la notificación de Meta es una confirmación de entrega o lectura, finalizamos
    if (!message) {
      return res.status(200).send('EVENT_RECEIVED');
    }

    const fromPhone = message.from;
    const messageType = message.type;

    // 3. PROCESAMIENTO DE MENSAJES ENTRANTES DE TEXTO
    
    

    if (messageType === 'text') {
      const userText = message.text.body.trim();
      const lowerText = userText.toLowerCase();
      const formData = responseJson;

      // ACTIVACIÓN DE FLOW VÍA PALABRA CLAVE
      if (lowerText.includes('renovar') || lowerText.includes('evaluar') || lowerText.includes('formulario')) {
        await sendFlowMessage(
          fromPhone,
          process.env.META_FLOW_ID,
          `token_${fromPhone}_${Date.now()}`,
          "Renovación de Vehículo",
          "Completa el siguiente formulario para evaluar la elegibilidad de tu renovación de movilidad.",
          "Iniciar Formulario"
        );
      } 
      else if (lowerText.includes('asesor') || lowerText.includes('humano') || lowerText.includes('ayuda')) {
        await sendTextMessage(fromPhone, "Entendido. He notificado a nuestro equipo de especialistas para que un asesor humano se comunique contigo a la brevedad.");
        await notifyHumanAgent(fromPhone, formData, {}, userText);
      } 
      else {
        // RESPUESTA AUTOMÁTICA DE Q&A VÍA GEMINI 1.5 FLASH
        const aiReply = await generateSafeResponse(userText, {});
        await sendTextMessage(fromPhone, aiReply);
      }
    }

    // Responder siempre 200 OK inmediatamente a Meta para evitar reintentos
    return res.status(200).send('EVENT_RECEIVED');

  } catch (error) {
    console.error('[VERCEL LOG] Error procesando el mensaje entrante:', error);
    return res.status(200).send('EVENT_RECEIVED');
  }
};