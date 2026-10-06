const { verifyMetaSignature } = require('../lib/verify_meta');
const { sendTextMessage, sendFlowMessage } = require('../lib/meta_client');
const { generateSafeResponse } = require('../lib/ai_service');

module.exports = async function handler(req, res) {
  // 1. VERIFICACIÓN GET (Requerida por Meta al registrar el Webhook)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      console.log('[VERCEL LOG] Webhook de Meta verificado con éxito.');
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden: Token de verificación inválido.');
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  // 2. VALIDACIÓN DE FIRMA SEGÚN CRITERIOS ISO 27001
  const signature = req.headers['x-hub-signature-256'];
  const rawBody = JSON.stringify(req.body);

  if (!verifyMetaSignature(rawBody, signature)) {
    console.error('[VERCEL LOG] Alerta de seguridad: Firma criptográfica rechazada.');
    return res.status(401).send('Unauthorized: Invalid Signature');
  }

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    // Si la notificación de Meta es una confirmación de entrega o lectura (no un mensaje), finalizamos
    if (!message) {
      return res.status(200).send('EVENT_RECEIVED');
    }

    const fromPhone = message.from;
    const messageType = message.type;

    // 3. PROCESAMIENTO DE MENSAJES ENTRANTES DE TEXTO
    if (messageType === 'text') {
      const userText = message.text.body.trim();
      const lowerText = userText.toLowerCase();

      // ACTIVACIÓN DE FLOWER VÍA PALABRA CLAVE
      // Si el usuario escribe palabras asociadas a evaluación o formulario, enviamos el Flow
      if (lowerText.includes('renovar') || lowerText.includes('evaluar') || lowerText.includes('formulario')) {
        await sendFlowMessage(
          fromPhone,
          process.env.META_FLOW_ID,
          `token_${fromPhone}_${Date.now()}`,
          "Renovación de Vehículo",
          "Completa el siguiente formulario para evaluar la elegibilidad de tu renovación de movilidad.",
          "Iniciar Formulario"
        );
      } else {
        // RESPUESTA AUTOMÁTICA DE Q&A VÍA GEMINI 1.5 FLASH
        const aiReply = await generateSafeResponse(userText, {});
        await sendTextMessage(fromPhone, aiReply);
      }
    }

    // Responder siempre 200 OK inmediatamente a Meta para evitar retentativas de envío (timeout Meta < 20s)
    return res.status(200).send('EVENT_RECEIVED');

  } catch (error) {
    console.error('[VERCEL LOG] Error procesando el mensaje entrante:', error);
    return res.status(200).send('EVENT_RECEIVED');
  }
};