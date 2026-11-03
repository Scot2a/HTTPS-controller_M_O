const { verifyMetaSignature } = require('../lib/verify_meta');
const { sendTextMessage, sendFlowMessage } = require('../lib/meta_client');
const { generateSafeResponse } = require('../lib/ai_service');
const { notifyHumanAgent } = require('../lib/handover_service');
const { getChatSession, saveChatSession } = require('../lib/redis_client'); // 👈 Actualizado a sesiones
const { updateOdooLead } = require('../lib/odoo_client'); // 👈 Importamos para actualizar Odoo

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

    // OBTENEMOS LA SESIÓN COMPLETA DESDE REDIS (Historial + Estado + LeadId)
    const session = await getChatSession(fromPhone);
    let history = session.history;

    // A. MANEJO DE MENSAJES INTERACTIVOS (Botones de Respuesta Rápida: Sí / No de la plantilla de landing)
    if (messageType === 'interactive' && message.interactive?.type === 'button_reply') {
      const buttonTitle = message.interactive.button_reply.title.trim(); // "Sí" o "No"
      console.log(`[VERCEL LOG] Botón interactivo recibido: ${buttonTitle} de ${fromPhone}`);

      // 1. Actualizamos en Odoo el campo x_studio_proceso_landing
      if (session.leadId) {
        await updateOdooLead(session.leadId, { x_studio_proceso_landing: buttonTitle });
      }

      // 2. Evaluamos la respuesta
      if (buttonTitle.toLowerCase().includes('sí') || buttonTitle.toLowerCase().includes('si')) {
        await sendTextMessage(fromPhone, "¡Excelente noticia! Nos alegra mucho que hayas podido finalizar tu solicitud con éxito. Si tienes alguna otra duda, aquí estamos para ayudarte.");
        session.state = 'IDLE';
        session.leadId = null; // Limpiamos el lead temporal de seguimiento
      } else {
        // Si responde "No", pasamos al estado de esperar la razón y extendemos el TTL a 24h
        session.state = 'AWAITING_REASON';
        await sendTextMessage(fromPhone, "¿Cuál fue el motivo por el que no pudiste finalizar el proceso en la landing? Cuéntanos brevemente para que un asesor pueda asistirte.");
      }

      history.push({ role: 'user', content: `[Botón presionado]: ${buttonTitle}` });
      session.history = history;
      await saveChatSession(fromPhone, session);
      return res.status(200).send('EVENT_RECEIVED');
    }

    // B. PROCESAMIENTO DE MENSAJES ENTRANTES DE TEXTO
    if (messageType === 'text') {
      const userText = message.text.body.trim();
      const lowerText = userText.toLowerCase();

      // B1. SI EL USUARIO ESTÁ RESPONDIENDO A LA RAZÓN DEL "NO" (Estado AWAITING_REASON)
      if (session.state === 'AWAITING_REASON') {
        // 1. Guardamos la razón en Odoo en el campo x_studio_razon_finalizacion_proceso
        if (session.leadId) {
          await updateOdooLead(session.leadId, { x_studio_razon_finalizacion_proceso: userText });
        }

        // 2. Notificamos al asesor humano con el motivo y el teléfono
        await sendTextMessage(fromPhone, "Entendido. He registrado tu motivo y notificado a nuestro equipo de especialistas para que se comuniquen contigo a la brevedad.");
        await notifyHumanAgent(fromPhone, { leadId: session.leadId }, userText);

        // 3. Reseteamos el estado de la sesión
        session.state = 'IDLE';
        session.leadId = null;
        history.push({ role: 'user', content: userText });
        history.push({ role: 'model', content: 'Entendido. He registrado tu motivo y notificado...' });
        session.history = history;
        await saveChatSession(fromPhone, session);
        return res.status(200).send('EVENT_RECEIVED');
      }

      // Validaciones para respuestas afirmativas contextuales ("sí", "claro", etc.)
      const affirmativeWords = ['sí', 'si', 'claro', 'por favor', 'ok', 'dale', 'perfecto', 'bueno'];
      const isAffirmative = affirmativeWords.some(word => lowerText === word || lowerText.startsWith(word + ' '));

      // Verificamos si el último mensaje del bot ofrecía el formulario/evaluación
      const lastAssistantMsg = history.slice().reverse().find(msg => msg.role === 'model')?.content?.toLowerCase() || '';
      const isOfferingForm = lastAssistantMsg.includes('formulario') || lastAssistantMsg.includes('evaluar') || lastAssistantMsg.includes('requisitos') || lastAssistantMsg.includes('incentivo');

      // B2. ACTIVACIÓN DE FLOW (Por palabras clave directas O por un "Sí" contextual)
      if (
        lowerText.includes('renovar') || 
        lowerText.includes('evaluar') || 
        lowerText.includes('formulario') ||
        lowerText.includes('aplicar') ||
        (isAffirmative && isOfferingForm)
      ) {
        await sendFlowMessage(
          fromPhone,
          process.env.META_FLOW_ID,
          `token_${fromPhone}_${Date.now()}`,
          "Renovación de Vehículo",
          "Queremos comprobar en un par de minutos si cumples con los requisitos para gestionar tu incentivo económico. Haz clic en el botón de abajo para iniciar el formulario de verificación rápida 👇",
          "Iniciar formulario CAE"
        );

        history.push({ role: 'user', content: userText });
        history.push({ role: 'model', content: '[Sistema: Se ha enviado el WhatsApp Flow interactivo al usuario]' });
        session.history = history;
        await saveChatSession(fromPhone, session);
      } 
      // B3. ACTIVACIÓN DE ASESOR HUMANO (Filtro estricto)
      else if (
        lowerText.includes('asesor') || 
        lowerText.includes('humano') || 
        lowerText === 'ayuda' || 
        lowerText.includes('necesito ayuda') || 
        lowerText.includes('hablar con')
      ) {
        await sendTextMessage(fromPhone, "Entendido. He notificado a nuestro equipo de especialistas para que un asesor humano se comunique contigo a la brevedad.");
        await notifyHumanAgent(fromPhone, {}, userText);

        history.push({ role: 'user', content: userText });
        history.push({ role: 'model', content: 'Entendido. He notificado a nuestro equipo de especialistas...' });
        session.history = history;
        await saveChatSession(fromPhone, session);
      } 
      // B4. RESPUESTA AUTOMÁTICA DE Q&A VÍA GEMINI CON HISTORIAL Y CONTEXTO
      else {
        const aiReply = await generateSafeResponse(userText, history, {});
        let finalReplyForUser = aiReply;

        if (aiReply.includes('[TRIGGER_HANDOVER]')) {
          finalReplyForUser = aiReply.replace('[TRIGGER_HANDOVER]', '').trim();
          await sendTextMessage(fromPhone, finalReplyForUser);
          await notifyHumanAgent(fromPhone, {}, userText);
          console.log('[VERCEL LOG] Handover humano activado automáticamente por Gemini.');
        } else {
          await sendTextMessage(fromPhone, aiReply);
        }
        // 3. Actualizamos y guardamos el historial limpio en Redis
        history.push({ role: 'user', content: userText });
        history.push({ role: 'model', content: finalReplyForUser });
        session.history = history;
        await saveChatSession(fromPhone, session);
      }
    }

    // Responder siempre 200 OK inmediatamente a Meta para evitar reintentos
    return res.status(200).send('EVENT_RECEIVED');

  } catch (error) {
    console.error('[VERCEL LOG] Error procesando el mensaje entrante:', error);
    return res.status(200).send('EVENT_RECEIVED');
  }
};