# Drako Bot — WhatsApp

Bot de WhatsApp basado en Node.js y Baileys. Incluye stickers, QR, consultas configuradas para Perú, utilidades locales y minijuegos.

## Comandos

### 🇵🇪 Perú y consultas conectadas
| Comando | Función |
| --- | --- |
| `/dni <número>` | Consulta RENIEC mediante Decolecta (requiere token y autorización para usar los datos) |
| `/tc`, `/dolar`, `/sunat` | Tipo de cambio mediante Decolecta |
| `/clima <ciudad>` | Consulta del clima en wttr.in |

### 🎨 Creatividad
| Comando | Función |
| --- | --- |
| `/s`, `/sticker` | Convierte una imagen enviada o citada en sticker |
| `/stickertexto <frase>` | Genera un sticker con texto |
| `/qr <texto o URL>` | Genera un código QR |

### 🎮 Juegos
| Comando | Función |
| --- | --- |
| `/adivina`, `/adivina <1-10>` | Adivina el número secreto |
| `/trivia`, `/respuesta <texto>` | Pregunta de cultura general |
| `/ppt piedra|papel|tijera` | Piedra, papel o tijera |
| `/ahorcado`, `/letra <letra>` | Ahorcado |
| `/tateti`, `/jugar <1-9>` | Tres en raya contra el bot |
| `/dado [caras]`, `/moneda` | Lanzamientos aleatorios |
| `/8ball <pregunta>`, `/chiste` | Bola mágica y chiste |

### 🧰 Utilidades gratuitas (locales)
| Comando | Función |
| --- | --- |
| `/calc <operación>` | Calculadora existente |
| `/porcentaje <porcentaje> <cantidad>` | Calcula porcentajes |
| `/binario encode|decode <texto>` | Conversor binario |
| `/base64 encode|decode <texto>` | Conversor Base64 |
| `/mayus <texto>`, `/minus <texto>` | Cambiar mayúsculas/minúsculas |
| `/contar <texto>`, `/texto <texto>` | Contar texto |
| `/reversa <texto>` | Invertir texto |
| `/temperatura <valor> C|F` | Convertir Celsius/Fahrenheit |
| `/fecha` | Fecha y hora de Perú |
| `/password [longitud]`, `/uuid` | Generadores locales |

### 👥 Herramientas de grupo
| Comando | Función |
| --- | --- |
| `/reglas` | Muestra reglas básicas |
| `/encuesta pregunta | opción 1 | opción 2` | Crea una encuesta por texto |
| `/votar <número>`, `/resultados` | Vota y consulta resultados |
| `/sorteo @miembros` | Selecciona un ganador |
| `/equipos @miembros` | Divide participantes en dos equipos |
| `/turno @miembros` | Crea un orden aleatorio |

### ⚙️ Sistema
| Comando | Función |
| --- | --- |
| `/menu`, `/ayuda`, `/juegos` | Menús de ayuda |
| `/ping`, `/info` | Estado y latencia |

## Compatibilidad y límites

- El menú usa texto y comandos para funcionar en clientes de WhatsApp compatibles con Baileys; no depende de botones interactivos experimentales.
- No se agregan dependencias ni claves API de pago.
- Los juegos, encuestas y sorteos mantienen estado temporal en memoria: se pierden cuando el proceso se reinicia. No son un sistema de votación anónima ni persistente.
- Las herramientas de grupo funcionan en grupos; los sorteos/equipos aceptan menciones o nombres separados por comas.
- Las consultas DNI y tipo de cambio dependen de la configuración externa existente. No uses el bot para consultar o divulgar datos personales sin autorización.

## Vincular WhatsApp mediante código (sin QR)

Baileys permite vincular la cuenta mediante un código de emparejamiento. Esta opción ya está implementada en `src/index.js` y se activa con `PAIRING_NUMBER`:

1. En Render, abre el servicio y entra en **Environment**.
2. Añade `PAIRING_NUMBER` con el número de WhatsApp que vas a vincular, en formato internacional y solo dígitos (por ejemplo, `519XXXXXXXX`; sin `+`, espacios ni guiones).
3. Guarda y despliega/reinicia el servicio. En **Logs** aparecerá el código temporal de vinculación.
4. En el teléfono que tiene esa cuenta de WhatsApp, abre **Ajustes → Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono** e introduce el código mostrado en Render.
5. Cuando la conexión se complete, Baileys guardará las credenciales usando el almacenamiento configurado (`MONGODB_URI` si está disponible).

Si prefieres usar QR, deja `PAIRING_NUMBER` sin configurar. No compartas el código de vinculación ni las credenciales de sesión: permiten acceder a tu cuenta.

## Variables de entorno

Configura en el hosting las variables que ya utiliza el proyecto, como `MONGODB_URI`, `DECOLECTA_TOKEN`, `QR_ACCESS_TOKEN`, `PAIRING_NUMBER`, `AUTO_REPLY` y las variables de stickers. No publiques sus valores.

## Desarrollo y pruebas

```bash
npm install
npm test
npm start
```

Las pruebas usan el módulo integrado `node:test` de Node.js y no requieren servicios externos.
