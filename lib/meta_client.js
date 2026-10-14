const META_API_VERSION = 'v26.0';
const META_TOKEN = process.env.META_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;

const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

async function metaFetch(payload) {
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${META_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('[VERCEL LOG] Error en Meta Graph API:', data);
    throw new Error(`Meta API Error: ${data.error?.message}`);
  }
  return data;
}

/**
 * Envia un mensaje de texto simple (Respuesta Q&A del Bot)
 */
async function sendTextMessage(toPhone, text) {
  return metaFetch({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: 'text',
    text: { preview_url: false, body: text }
  });
}

/**
 * Envía una plantilla preaprobada (Para seguimiento y cualificación)
 */
async function sendTemplateMessage(toPhone, templateName, languageCode = 'es', components = []) {
  const payload = {
    messaging_product: 'whatsapp',
    to: toPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
    }
  };

  if (components && components.length > 0) {
    payload.template.components = components;
  }

  return metaFetch(payload);
}

/**
 * Envía un mensaje interactivo con el botón para abrir el WhatsApp Flow
 */
async function sendFlowMessage(toPhone, flowId, flowToken, headerText, bodyText, buttonText = "Completar Formulario") {
  return metaFetch({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: { type: 'text', text: headerText },
      body: { text: bodyText },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: flowToken, // Un ID único para rastrear este envío (ej. ID del lead)
          flow_id: flowId,
          flow_cta: buttonText,
          flow_action: 'navigate',
          flow_action_payload: { screen: 'SCREEN_ONE' }
        }
      }
    }
  });
}

module.exports = { sendTextMessage, sendTemplateMessage, sendFlowMessage };