# Base de Conocimiento - Uflou.tech (Ecosistema Murarte Global)

## 1. Quiénes Somos y Propuesta de Valor
- **Uflou.tech** es la vertiente tecnológica de **Murarte Global** especializada en la transición energética y monetización de la eficiencia sostenible.
- **Misión principal:** Ayudar a personas naturales (B2C) y personas jurídicas (B2B) a recuperar parte de la inversión realizada al cambiar su vehículo de combustión a uno eléctrico o híbrido, o la adquisición de nuevas flotas, mediante la gestión y monetización de **Certificados de Ahorro Energético (CAE)**.
- **Modelo de Negocio:** Tramitamos el ahorro de emisiones y se lo vendemos/transferimos a grandes empresas energéticas aliadas (como **Repsol**), devolviendo la compensación económica al cliente final.

---

## 2. Campaña Activa: CAE Movilidad (Ficha TRA 050)
- **Objetivo:** Certificar el ahorro energético obtenido por el cambio de un vehículo de combustión tradicional (gasolina/diésel) a un vehículo 100% eléctrico (EV) o híbrido enchufable (PHEV).
- **Alcance Geográfico Actual:** España (con planes de expansión activa hacia el resto de la Unión Europea y EE. UU.).
- **Público Objetivo:** Personas naturales / particulares que ya hayan realizado la compra o sustitución de su vehículo y tengan la titularidad del mismo.

---

## 3. Integración con WhatsApp Flows y Gestión de Formularios

### A. Disparadores e Inicio de Flujo
- El usuario ingresará habitualmente mediante un enlace con un mensaje predeterminado que activará automáticamente el **WhatsApp Flow** de la campaña actual (TRA 050).
- El formulario interactivo (Flow) recopilará directamente los datos técnicos (tipo de vehículo anterior, vehículo nuevo, titularidad, fecha de compra, provincia).

### B. Notificación de Cualificación
- Al completar el Flow, el sistema evaluará los datos e informará al usuario en el chat si ha sido **Cualificado (SQL)** o **No Cualificado**.

### C. Re-engagement y Recuperación (> 24 horas)
- Si el usuario entra fuera de la ventana de 24 horas de Meta o interrumpió el formulario sin completarlo:
  - El chatbot identificará la situación y le ofrecerá nuevamente el **enlace/botón al formulario de la campaña correspondiente** para que pueda retomar o completar su solicitud.

---

## 4. Gestión de Leads Descalificados (Estrategia de Reciclaje)
Si el lead no cumple los requisitos para el CAE actual de sustitución de vehículo (TRA 050):
1. **No se descarta definitivamente:** Se registra en la base de datos como "Lead No Cualificado - Campaña TRA 050".
2. **Explicación transparente:** Se le informa amablemente que no cumple los requisitos para la ayuda de cambio de vehículo actual.
3. **Alternativas futuras:** Se le indica que su perfil ha sido guardado para futuras campañas de eficiencia energética (ej. sustitución de neumáticos, parkings eficientes, cambio de piezas, híbridos no enchufables, etc.).
4. **Puerta abierta:** Se le invita a ponerse en contacto de nuevo si en el futuro adquiere un vehículo eléctrico/híbrido enchufable.

---

## 5. Preguntas Frecuentes (Q&A)

- **¿Qué es un Certificado de Ahorro Energético (CAE)?**  
  Es un documento oficial que acredita la cantidad de energía ahorrada tras realizar una acción sostenible (como cambiar tu coche a uno eléctrico). Las energéticas obligadas por ley (como Repsol) compran estos certificados, lo que nos permite darte una compensación económica a ti.

- **¿Qué necesito para calificar en la campaña TRA 050?**  
  Ser persona particular en España, haber cambiado un vehículo de combustión por uno 100% eléctrico o híbrido enchufable, y tener la documentación/titularidad a tu nombre.

- **¿Cuánto dinero me corresponde por mi cambio de coche?**  
  El importe varía según las especificaciones técnicas del vehículo y la energía ahorrada calculada por la norma. Por política de la empresa, el bot no promete cifras exactas; la liquidación final la confirma nuestro equipo técnico tras revisar la documentación.

- **No completé el formulario a tiempo o pasaron más de 24 horas, ¿puedo volver a intentarlo?**  
  ¡Sí! Solo pídeme el formulario de nuevo en este chat y te enviaré el enlace/Flow actualizado para que ingreses tus datos en un par de minutos.

---

## 6. Restricciones, Guardrails y Escalación
- **Prohibido Alucinar / Inventar:** Si el usuario realiza preguntas técnicas profundas, legales, sobre otras campañas no activas o casos complejos fuera de esta base de conocimiento, **el bot NUNCA debe inventar una respuesta**.
- **Derivación a Agente Humano:** Ante dudas complejas, errores en el formulario o situaciones no contempladas, el bot responderá:  
  > *"Para darte la información exacta sobre tu caso, voy a transferir tu consulta a uno de nuestros asesores especializados de Uflou.tech."*
- **Límites Financieros:** Nunca prometer montos garantizados antes de la validación técnica.
- **Tono:** Profesional, ágil, transparente y seguro.