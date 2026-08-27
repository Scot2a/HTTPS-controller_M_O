import crypto from 'crypto';

export default async function handler(req, res) {
  // Meta envía peticiones por POST
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { encrypted_aes_key, encrypted_flow_data, initial_vector } = req.body;
    
    // 1. Decodificar las cadenas Base64
    const aesKeyBuffer = Buffer.from(encrypted_aes_key, 'base64');
    const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
    const ivBuffer = Buffer.from(initial_vector, 'base64');

    // 2. Desencriptar la llave AES con tu Llave Privada RSA
    const decryptedAesKey = crypto.privateDecrypt(
      {
        key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      aesKeyBuffer
    );

    // 3. Desencriptar el payload de Meta (AES-GCM)
    const authTag = flowDataBuffer.subarray(-16);
    const ciphertext = flowDataBuffer.subarray(0, -16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', decryptedAesKey, ivBuffer);
    decipher.setAuthTag(authTag);
    const decryptedData = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const flowData = JSON.parse(decryptedData.toString('utf-8'));

    let responseData = {};

    // 4. Lógica de Enrutamiento y Conexión con Odoo
    if (flowData.action === 'ping') {
      responseData = { version: "3.0", data: { status: "active" } };
    } else {
      // Extraer las respuestas del formulario de WhatsApp
      const userResponses = flowData.data; 
      
      // Enviar de forma asíncrona a Odoo
      await pushToOdoo(userResponses);

      // Respuesta para que WhatsApp pase a la pantalla final
      responseData = {
        version: "3.0",
        screen: "PANTALLA_DE_EXITO", // MODIFICAR: Coloca el ID de tu pantalla final de Flows
        data: { success: true }
      };
    }

    // 5. Encriptar la respuesta invirtiendo el Vector de Inicialización (Bitwise NOT)
    const flippedIv = Buffer.alloc(12);
    for (let i = 0; i < 12; i++) {
      flippedIv[i] = ~ivBuffer[i] & 0xff; 
    }

    const cipher = crypto.createCipheriv('aes-256-gcm', decryptedAesKey, flippedIv);
    const encryptedResponse = Buffer.concat([
      cipher.update(JSON.stringify(responseData), 'utf8'),
      cipher.final()
    ]);
    const finalPayload = Buffer.concat([encryptedResponse, cipher.getAuthTag()]);

    // 6. Retornar a Meta
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(finalPayload.toString('base64'));

  } catch (error) {
    console.error("Error en el endpoint:", error);
    res.status(500).send("Error interno");
  }
}

// Función de Comunicación XML/JSON-RPC con Odoo
async function pushToOdoo(data) {
  const url = `${process.env.ODOO_URL}/jsonrpc`;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;

  // Paso A: Autenticar para obtener el UID
  const authResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service: "common", method: "authenticate", args: [db, username, apiKey, {}] }
    })
  });
  const authJson = await authResponse.json();
  const uid = authJson.result;

  if (!uid) throw new Error("Fallo de autenticación en Odoo");

  // Paso B: Mapear los campos personalizados (MODIFICAR: Ajustar a las llaves de tu Flow)
  const leadPayload = {
    name: "Lead Cualificado - WhatsApp Flows",
    phone: data.telefono_cliente || '', 
    x_studio_qualification_score: data.puntuacion || 0,
    x_studio_tipo: data.tipo_vehiculo || false,
    x_studio_titular: data.es_titular || false,
    x_studio_momento: data.momento_compra || false,
    x_studio_modo_de_contacto: data.metodo_contacto || false,
    x_studio_vehiculo_anterior: data.vehiculo_previo || false,
    x_studio_venta_baja: data.estado_venta || false,
    x_studio_mismo_titular: data.mismo_titular || false,
    x_studio_conviviente: data.es_conviviente || false,
    x_studio_bought_post_2024: data.compro_post_2024 || false,
    x_studio_selection_1_1: data.menos_3_meses || false,
    x_studio_selection_2_1: data.menos_6_meses || false,
    // Puedes inyectar stage_id aquí si calculas el score en Vercel
  };

  // Paso C: Crear el registro en crm.lead
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { 
        service: "object", 
        method: "execute_kw", 
        args: [db, uid, apiKey, 'crm.lead', 'create', [leadPayload]] 
      }
    })
  });
}
