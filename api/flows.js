import crypto from 'crypto';

export default async function handler(req, res) {
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

    // 2. Desencriptar la llave AES
    const decryptedAesKey = crypto.privateDecrypt(
      {
        key: privateKey,
        passphrase: process.env.PASSPHRASE, // Descomenta solo si tu llave actual tiene contraseña
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      aesKeyBuffer
    );

    // 3. Desencriptar el payload de Meta (AES-GCM dinámico)
    const aesAlgorithm = decryptedAesKey.length === 16 ? 'aes-128-gcm' : 'aes-256-gcm';
    console.log(`[VERCEL LOG] Longitud AES: ${decryptedAesKey.length} bytes. Algoritmo: ${aesAlgorithm}`);

    const authTag = flowDataBuffer.subarray(-16);
    const ciphertext = flowDataBuffer.subarray(0, -16);
    const decipher = crypto.createDecipheriv(aesAlgorithm, decryptedAesKey, ivBuffer);
    decipher.setAuthTag(authTag);
    const decryptedData = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const flowData = JSON.parse(decryptedData.toString('utf-8'));

    // 4. Declaración y Lógica de Enrutamiento
    // ... (tu código de desencriptación previo) ...

let responseData = {};

if (flowData.action === 'ping') {
    // Validación inicial de Meta
    responseData = {
        version: "3.0",
        data: { status: "active" }
    };
} else if (flowData.action === 'INIT') {
    // Respuesta inicial cuando el usuario abre el flujo
    responseData = {
        version: "3.0",
        screen: "SCREEN_ONE",
        data: {}
    };
} else if (flowData.action === 'data_exchange') {
    // Recepción del payload final desde SCREEN_EIG
    const formData = flowData.data;

    // Transformación de datos para Odoo
    const leadPayload = {
        name: "Nuevo Lead EV - Calificación", 
        // Campos nativos habituales en Odoo
        email_from: formData.email_cliente || "",
        phone: formData.telefono_cliente || "",
        // Campos personalizados (ajusta "x_studio_" según tu nomenclatura)
        x_studio_compra_post_2024: formData.compra_post,
        x_studio_tipo_vehiculo: formData.tipo_vehiculo,
        x_studio_vehiculo_previo: formData.vehiculo_previo,
        x_studio_es_titular: formData.es_titular,
        x_studio_mismo_titular: formData.mismo_titular,
        x_studio_estado_venta: formData.estado_venta,
        x_studio_es_conviviente: formData.es_conviviente,
        x_studio_momento_compra: formData.momento_compra,
        x_studio_menos_3_meses: formData.menos_3_meses,
        x_studio_menos_6_meses: formData.menos_6_meses,
        x_studio_metodo_contacto: formData.metodo_contacto
    };

    // Aquí ejecutas la integración (ej. automatización Python / endpoint de Odoo)
    // await enviarLeadAOdoo(leadPayload);

    // Respuesta a Meta para avanzar a la pantalla final
    responseData = {
        version: "3.0",
        screen: "PANTALLA_DE_EXITO",
        data: { success: true }
    };
}

// ... (tu código de encriptación AES/RSA y res.send) ...

    // 5. Encriptar la respuesta invirtiendo el Vector de Inicialización (Bitwise NOT)
    const flippedIv = Buffer.alloc(ivBuffer.length); // Se adapta automáticamente a 16 bytes
    for (let i = 0; i < ivBuffer.length; i++) {
      flippedIv[i] = ~ivBuffer[i] & 0xff; 
    }

    const cipher = crypto.createCipheriv(aesAlgorithm, decryptedAesKey, flippedIv);
    const encryptedResponse = Buffer.concat([
      cipher.update(JSON.stringify(responseData), 'utf8'),
      cipher.final()
    ]);
    const finalPayload = Buffer.concat([encryptedResponse, cipher.getAuthTag()]);

    // 6. Retornar a Meta
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(finalPayload.toString('base64'));

  } catch (error) {
    console.error("Error criptográfico detallado:", error);
    res.status(500).send("Error interno");
  }
}
