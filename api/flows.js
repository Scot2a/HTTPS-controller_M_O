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

    // AQUÍ ESTÁ LA VARIABLE QUE FALTABA (aesKeyBuffer)
    const aesKeyBuffer = Buffer.from(encrypted_aes_key, 'base64');
    const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
    const ivBuffer = Buffer.from(initial_vector, 'base64');

    // Forzar la lectura de saltos de línea correctos de la variable de entorno
    const privateKey = process.env.PRIVATE_KEY.replace(/\\n/g, '\n');

    // 2. Desencriptar la llave AES
    const decryptedAesKey = crypto.privateDecrypt(
      {
        key: privateKey,
        // Si tu llave no tiene contraseña, comenta la línea de abajo (// passphrase...)
        passphrase: process.env.PASSPHRASE, 
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

    // 4. Lógica de Enrutamiento
    if (flowData.action === 'ping') {
      responseData = { version: "3.0", data: { status: "active" } };
    } else {
      // Aquí enviaríamos a Odoo. Por ahora, solo respondemos a Meta para validar
      responseData = {
        version: "3.0",
        screen: "PANTALLA_DE_EXITO", 
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

    // 6. Retornar a Meta en texto plano Base64
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(finalPayload.toString('base64'));

  } catch (error) {
    console.error("Error criptográfico detallado:", error);
    res.status(500).send("Error interno");
  }
}
