const { verifyMetaSignature } = require('../lib/verify_meta');
const { sendTextMessage, sendFlowMessage } = require('../lib/meta_client');
const { generateSafeResponse } = require('../lib/ai_service');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      console.log('[VERCEL LOG] Webhook verificado correctamente.');
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Token de verificación inválido.');
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const signature = req.headers['x-hub-signature-256'];
  const rawBody = JSON.stringify(req.body);

  if (!verifyMetaSignature(rawBody, signature)) {
    console.error('[VERCEL LOG] Firma criptográfica inválida.');
    return res.status(401).send('Unauthorized');
  }

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return res.status(200).send('EVENT_RECEIVED');
    }

    const fromPhone = message.from;
    const messageType = message.type;

    if (messageType === 'text') {
      const userText = message.text.body.trim();
      const lowerText = userText.toLowerCase();

      // ENRUTAMIENTO POR PALABRAS CLAVE (TRIGGERS DE FLOWS)
      if (lowerText.includes('renovar') || lowerText.includes('flota') || lowerText.includes('formulario')) {
        // Dispara el WhatsApp Flow de Renovación
        await sendFlowMessage(
          fromPhone,
          process.env.META_FLOW_ID, // Puedes escalar esto a un objeto de diccionario si manejas múltiples IDs
          `token_${fromPhone}_${Date.now()}`,
          "Renovación de Vehículo",
          "Completa el formulario oficial para evaluar tu elegibilidad en el programa sostenible.",
          "Iniciar Formulario"
        );
      } 
      else if (lowerText.includes('asesor') || lowerText.includes('humano') || lowerText.includes('ayuda')) {
        // Respuesta predefinida para derivación a agente en Odoo
        await sendTextMessage(fromPhone, "Entendido. He notificado a nuestro equipo de especialistas para que un asesor humano se comunique contigo a la brevedad.");
      } 
      else {
        // PREGUNTAS GENERALES (Q&A vía Gemini + Base de Conocimiento)
        // Puedes inyectar datos adicionales si los recuperas de un registro previo
        const aiReply = await generateSafeResponse(userText, {});
        await sendTextMessage(fromPhone, aiReply);
      }
    }

    return res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('[VERCEL LOG] Error en webhook:', error);
    return res.status(200).send('EVENT_RECEIVED');
  }
};