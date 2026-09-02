const crypto = require('crypto');

// Corrección 1: Usar module.exports en lugar de export default
module.exports = async function handler(req, res) {
  console.log(`[VERCEL LOG] Petición entrante - Método: ${req.method}`);

  if (req.method === 'GET' || req.method === 'OPTIONS') {
    return res.status(200).send("Endpoint activo");
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { encrypted_aes_key, encrypted_flow_data, initial_vector } = req.body;
    
    if (!encrypted_aes_key || !encrypted_flow_data) {
      return res.status(400).send("Faltan datos de encriptación");
    }

    const aesKeyBuffer = Buffer.from(encrypted_aes_key, 'base64');
    const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
    const ivBuffer = Buffer.from(initial_vector, 'base64');

    const privateKey = process.env.PRIVATE_KEY.replace(/\\n/g, '\n');

    const decryptedAesKey = crypto.privateDecrypt(
      {
        key: privateKey,
        passphrase: process.env.PASSPHRASE,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      aesKeyBuffer
    );

    const aesAlgorithm = decryptedAesKey.length === 16 ? 'aes-128-gcm' : 'aes-256-gcm';
    console.log(`[VERCEL LOG] Longitud AES: ${decryptedAesKey.length} bytes. Algoritmo: ${aesAlgorithm}`);

    const authTag = flowDataBuffer.subarray(-16);
    const ciphertext = flowDataBuffer.subarray(0, -16);
    const decipher = crypto.createDecipheriv(aesAlgorithm, decryptedAesKey, ivBuffer);
    decipher.setAuthTag(authTag);
    const decryptedData = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const flowData = JSON.parse(decryptedData.toString('utf-8'));

    async function enviarLeadAOdoo(payload) {
      const odooUrl = `${process.env.ODOO_URL}/jsonrpc`; 
      console.log("[VERCEL LOG] Enviando datos a Odoo...");
      
      const rpcBody = {
        jsonrpc: "2.0",
        method: "call",
        params: {
          service: "object",
          method: "execute_kw",
          args: [
            process.env.ODOO_DB, // Corrección 2: Nombre de la variable
            parseInt(process.env.ODOO_UID), 
            process.env.ODOO_API_KEY, 
            "crm.lead",               // Corrección 3: Modelo correcto
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

      if (!response.ok) {
        throw new Error(`Fallo de conexión HTTP: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        console.error("[VERCEL LOG] Error interno de Odoo:", JSON.stringify(data.error));
        throw new Error('Odoo rechazó los campos. Verifica los x_studio_');
      }

      console.log("[VERCEL LOG] Lead creado exitosamente en Odoo con ID:", data.result);
      return data.result;
    }

    let responseData = {};

    if (flowData.action === 'ping') {
        responseData = { version: "3.0", data: { status: "active" } };
    } else if (flowData.action === 'INIT') {
        responseData = { version: "3.0", screen: "SCREEN_ONE", data: {} };
    } else if (flowData.action === 'data_exchange') {
        const formData = flowData.data;

        const leadPayload = {
            name: "Nuevo Lead EV - Calificación", 
            email_from: formData.email_cliente || "",
            phone: formData.telefono_cliente || "",
            x_studio_bought_post: formData.compra_post,
            x_studio_tipo: formData.tipo_vehiculo,
            x_studio_vehiculo_anterior: formData.vehiculo_previo,
            x_studio_titular: formData.es_titular,
            x_studio_mismo_titular: formData.mismo_titular,
            x_studio_venta_baja: formData.estado_venta,
            x_studio_es_conviviente: formData.es_conviviente,
            x_studio_momento: formData.momento_compra,
            x_studio_menos_3_meses: formData.menos_3_meses,
            x_studio_menos_6_meses: formData.menos_6_meses,
            x_studio_modo_de_contacto: formData.metodo_contacto
        };

        try {
            await enviarLeadAOdoo(leadPayload);
            responseData = {
                version: "3.0",
                screen: "PANTALLA_DE_EXITO",
                data: { success: true }
            };
        } catch (error) {
            console.error("[VERCEL LOG] Error en data_exchange:", error.message);
            responseData = {
                version: "3.0",
                screen: "SCREEN_EIG", 
                data: { error_msg: "Hubo un problema registrando tu solicitud. Intenta de nuevo." }
            };
        }
    }

    const flippedIv = Buffer.alloc(ivBuffer.length);
    for (let i = 0; i < ivBuffer.length; i++) {
      flippedIv[i] = ~ivBuffer[i] & 0xff; 
    }

    const cipher = crypto.createCipheriv(aesAlgorithm, decryptedAesKey, flippedIv);
    const encryptedResponse = Buffer.concat([
      cipher.update(JSON.stringify(responseData), 'utf8'),
      cipher.final()
    ]);
    const finalPayload = Buffer.concat([encryptedResponse, cipher.getAuthTag()]);

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(finalPayload.toString('base64'));

  } catch (error) {
    console.error("Error criptográfico detallado:", error);
    res.status(500).send("Error interno");
  }
};
