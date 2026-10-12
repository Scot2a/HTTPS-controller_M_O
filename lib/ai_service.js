const fs = require('fs');
const path = require('path');

/**
 * Generates a safe response based on company policy.
 * @param {string} userMessage La pregunta del lead.
 * @param {object} leadData Información inyectada
 */
async function generateSafeResponse(userMessage, leadData = {}) {
  
  // 1. Cargar la información de la empresa desde el archivo markdown
  const knowledgeBasePath = path.join(process.cwd(), 'data', 'company_info.md');
  let companyInfo = "Empresa de innovación sostenible en movilidad y desarrollo urbano (B2B/B2C)."; 
  try {
    companyInfo = fs.readFileSync(knowledgeBasePath, 'utf8');
  } catch (e) {
    console.warn("[VERCEL LOG] Archivo company_info.md no encontrado, usando backup context.");
  }

  // 2. Importación dinámica obligatoria para paquetes ESM en Vercel
  const { generateText } = await import('ai');
  const { google } = await import('@ai-sdk/google');

  const leadContext = leadData.nombre 
    ? `\n\nEl usuario con el que hablas se llama: ${leadData.nombre} ${leadData.apellido || ''}. Dirígete a él de forma profesional.`
    : `\n\nHablas con un usuario anónimo (lead potencial).`;

  // SYSTEM PROMPT (GUARDRAILS STRICTOS)
  const systemPrompt = `
    Eres un asistente de primer contacto para una empresa de innovación sostenible en movilidad y desarrollo urbano.
    Tu objetivo es responder preguntas básicas (Q&A) de manera concisa y profesional.

    INFORMACIÓN DE LA EMPRESA (BASE DE CONOCIMIENTO BASE):
    ${companyInfo}
    ${leadContext}

    REGLAS ESTRICTAS DE SEGURIDAD (GUARDRAILS):
    1. RESTRICCIÓN DE DOMINIO: Solo debes responder preguntas relacionadas a la información de la empresa provista arriba.
    2. NO INVENCIONES: Si la respuesta no está en tu base de conocimiento, responde exactamente: "No tengo esa información detallada en este momento, pero un asesor especializado te contactará pronto."
    3. CERO MEDIOS: Tienes estrictamente prohibido generar, describir o referenciar imágenes, videos o audios. Trabajas solo con texto.
    4. NO CÓDIGO NI INTERNET: No realices búsquedas en internet, no programes código, ni respondas temas de política o tecnología ajenos a la movilidad sostenible.
    5. BREVEDAD: Tus respuestas no deben superar los 2 o 3 párrafos cortos (optimizado para lectura en WhatsApp).
  `;

  try {
    const { text } = await generateText({
      model: google('google/gemini-2.5-flash-lite'),
      system: systemPrompt,
      prompt: userMessage,
      maxTokens: 400,
      temperature: 0.1, // Temperatura baja para máxima predictibilidad
    });

    console.log("[VERCEL LOG] Texto generado por Gemini:", text);

    return text;
  } catch (error) {
    console.error("[VERCEL LOG] Error crítico en Gemini AI:", error);
    return "Lo siento, estoy teniendo un inconveniente técnico. En breve un asesor humano tomará tu consulta.";
  }
}

module.exports = { generateSafeResponse };