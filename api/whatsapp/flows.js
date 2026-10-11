const crypto = require('crypto');

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
    const authTag = flowDataBuffer.subarray(-16);
    const ciphertext = flowDataBuffer.subarray(0, -16);
    const decipher = crypto.createDecipheriv(aesAlgorithm, decryptedAesKey, ivBuffer);
    decipher.setAuthTag(authTag);
    const decryptedData = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const flowData = JSON.parse(decryptedData.toString('utf-8'));

    // NUEVO: Función auxiliar adaptada a JSON-RPC con fetch
    async function getOrCreateUtmId(model, name) {
      if (!name) return false;
      const odooUrl = `${process.env.ODOO_URL}/jsonrpc`;

      // 1. Buscar si existe
      const searchBody = {
        jsonrpc: "2.0", method: "call",
        params: {
          service: "object", method: "execute_kw",
          args: [
            process.env.ODOO_DB, parseInt(process.env.ODOO_UID), process.env.ODOO_API_KEY, 
            model, "search", [[["name", "=", name]]], { limit: 1 }
          ]
        }
      };

      try {
        let response = await fetch(odooUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(searchBody) });
        let data = await response.json();
        
        if (data.result && data.result.length > 0) {
          return data.result[0]; // Retorna el ID numérico existente
        }

        // 2. Si no existe, crearlo
        const createBody = {
          jsonrpc: "2.0", method: "call",
          params: {
            service: "object", method: "execute_kw",
            args: [
              process.env.ODOO_DB, parseInt(process.env.ODOO_UID), process.env.ODOO_API_KEY, 
              model, "create", [{ name: name }]
            ]
          }
        };

        response = await fetch(odooUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createBody) });
        data = await response.json();
        return data.result; // Retorna el nuevo ID numérico

      } catch (error) {
        console.error(`[VERCEL LOG] Error procesando UTM (${model}):`, error);
        return false;
      }
    }

    async function enviarLeadAOdoo(payload) {
      const odooUrl = `${process.env.ODOO_URL}/jsonrpc`; 
      
      const rpcBody = {
        jsonrpc: "2.0", method: "call",
        params: {
          service: "object", method: "execute_kw",
          args: [
            process.env.ODOO_DB, parseInt(process.env.ODOO_UID), process.env.ODOO_API_KEY, 
            "crm.lead", "create", [payload]
          ]
        }
      };

      const response = await fetch(odooUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rpcBody)
      });

      if (!response.ok) throw new Error(`Fallo HTTP: ${response.status}`);
      const data = await response.json();
      if (data.error) {
        const odooDebug = data.error.data ? data.error.data.message : "Error desconocido";
        console.error("[VERCEL LOG] Traceback completo de Odoo:", JSON.stringify(data.error));
        throw new Error(`Odoo rechazó la estructura. Causa: ${odooDebug}`);
    };
      
      return data.result;
    }

    let responseData = {};

    if (flowData.action === 'ping') {
        responseData = { version: "3.0", data: { status: "active" } };
    } else if (flowData.action === 'INIT') {
        responseData = { version: "3.0", screen: "SCREEN_ONE", data: {} };
    } else if (flowData.action === 'data_exchange') {
        const formData = flowData.data;

        const mapSiNo = { "Si": "Sí", "No": "No" };
        const mapVehiculo = {"Combustion": "Combustión", "Hibrido": "Híbrido", "Electrico": "Eléctrico" };
        const mapMomento = { "Despues": "Después" };
        const mapModo = {"Movil": "Móvil"};

        // RESOLUCIÓN DE UTMs
        const idSource = await getOrCreateUtmId("utm.source", "Meta");
        const idMedium = await getOrCreateUtmId("utm.medium", "WhatsApp flows");
        const idCampaign = await getOrCreateUtmId("utm.campaign", "Campaña TRA050P");

        const leadPayload = {
            name: "Campaña de renovación de Vehículo eléctrico", 
            type: "opportunity",
            x_studio_lead_name: formData.nombre_cliente,
            x_studio_lead_lastname: formData.apellido_cliente,
            email_from: formData.email_cliente || "",
            phone: formData.telefono_cliente || "",
            x_studio_bought_post: mapSiNo[formData.compra_post] || formData.compra_post,
            x_studio_tipo: mapSiNo[formData.tipo_vehiculo] || formData.tipo_vehiculo,
            x_studio_vehiculo_anterior: mapVehiculo[formData.vehiculo_previo] || formData.vehiculo_previo,
            x_studio_titular: mapSiNo[formData.es_titular] || formData.es_titular,
            x_studio_mismo_titular: mapSiNo[formData.mismo_titular] || formData.mismo_titular,
            x_studio_venta_baja: formData.estado_venta,
            x_studio_es_conviviente: mapSiNo[formData.es_conviviente] || formData.es_conviviente,
            x_studio_momento: mapMomento[formData.momento_compra] || formData.momento_compra,
            x_studio_menos_3_meses: mapSiNo[formData.menos_3_meses] || formData.menos_3_meses,
            x_studio_menos_6_meses: mapSiNo[formData.menos_6_meses] || formData.menos_6_meses,
            x_studio_modo_de_contacto: mapModo[formData.metodo_contacto] || formData.metodo_contacto,
            
            // ASIGNACIÓN DE IDs NUMÉRICOS A LOS CAMPOS MANY2ONE
            x_studio_source_origin: idSource || false,
            x_studio_medium_origin: idMedium || false,
            x_studio_campaign_origin: idCampaign || false
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
                screen: "SCREEN_TEN", 
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
