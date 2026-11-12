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
| `/ppt piedra\|papel\|tijera` | Piedra, papel o tijera |
| `/ahorcado`, `/letra <letra>` | Ahorcado |
| `/tateti`, `/jugar <1-9>` | Tres en raya contra el bot |
| `/dado [caras]`, `/moneda` | Lanzamientos aleatorios |
| `/8ball <pregunta>`, `/chiste` | Bola mágica y chiste |

### 🧰 Utilidades gratuitas (locales)
| Comando | Función |
| --- | --- |
| `/calc <operación>` | Calculadora existente |
| `/porcentaje <porcentaje> <cantidad>` | Calcula porcentajes |
| `/binario encode\|decode <texto>` | Conversor binario |
| `/base64 encode\|decode <texto>` | Conversor Base64 |
| `/mayus <texto>`, `/minus <texto>` | Cambiar mayúsculas/minúsculas |
| `/contar <texto>`, `/texto <texto>` | Contar texto |
| `/reversa <texto>` | Invertir texto |
| `/temperatura <valor> C|F` | Convertir Celsius/Fahrenheit |
| `/fecha` | Fecha y hora de Perú |
| `/hora [zona horaria]` | Hora en una zona IANA, por ejemplo `America/Caracas` |
| `/elige opción 1 | opción 2` | Elegir una opción al azar |
| `/rango <mínimo> <máximo>` | Elegir un entero aleatorio entre los límites |
| `/password [longitud]`, `/uuid` | Generadores locales |

### 👥 Herramientas de grupo
| Comando | Función |
| --- | --- |
| `/reglas [texto]` | Muestra o cambia las reglas del grupo |
| `/encuesta pregunta \| opción 1 \| opción 2` | Crea una encuesta por texto |
| `/votar <número>`, `/resultados` | Vota y consulta resultados |
| `/sorteo @miembros` | Selecciona un ganador |
| `/equipos @miembros` | Divide participantes en dos equipos |
| `/turno @miembros` | Crea un orden aleatorio |
| `/moderacion activar`, `/moderacion desactivar` | Activa o desactiva los filtros del grupo |
| `/moderacion enlaces\|stickers\|ofensas on\|off` | Configura cada filtro (solo administradores) |
| `/moderacion palabras agregar\|quitar <término>` | Añade o quita términos personalizados |

### ⚙️ Sistema
| Comando | Función |
| --- | --- |
| `/menu`, `/ayuda`, `/juegos` | Menús de ayuda |
| `/ping`, `/info` | Estado y latencia |

### Configurar moderación en un grupo

1. Agrega el bot al grupo y asígnale el rol de administrador para que pueda borrar mensajes.
2. Un administrador del grupo envía `/moderacion activar` para activar los filtros de enlaces, stickers y lenguaje ofensivo.
3. Usa `/reglas <texto>` para guardar las reglas visibles en ese grupo.
4. Usa `/moderacion palabras agregar <término o frase>` para ampliar la lista local de términos bloqueados.

Los filtros se pueden cambiar por separado con `/moderacion enlaces|stickers|ofensas on|off` y revisar con `/moderacion estado`. El bot borra el contenido detectado y avisa al autor; no expulsa miembros. Los mensajes de administradores no se filtran.

## Compatibilidad y límites

- El menú usa texto y comandos para funcionar en clientes de WhatsApp compatibles con Baileys; no depende de botones interactivos experimentales.
- No se agregan dependencias ni claves API de pago.
- Los juegos, encuestas y sorteos mantienen estado temporal en memoria: se pierden cuando el proceso se reinicia. No son un sistema de votación anónima ni persistente.
- Las herramientas de grupo funcionan en grupos; los sorteos/equipos aceptan menciones o nombres separados por comas.
- La moderación está apagada por defecto y se configura por grupo. Para activarla, el usuario que envía el comando y el bot deben ser administradores; el bot necesita ese rol para borrar mensajes. Los mensajes de administradores no se filtran. Las reglas y ajustes se guardan en MongoDB cuando `MONGODB_URI` existe, o en `data/group-moderation.json` como alternativa local.
- Los filtros borran enlaces, stickers y términos ofensivos cuando están activados, y avisan al autor. El detector de ofensas usa una lista inicial y permite agregar términos específicos del grupo.
- Las consultas DNI y tipo de cambio dependen de la configuración externa existente. No uses el bot para consultar o divulgar datos personales sin autorización.

## Vincular WhatsApp mediante código (sin QR)

Baileys permite vincular la cuenta mediante un código de emparejamiento. Esta opción ya está implementada en `src/index.js` y se activa con `PAIRING_NUMBER`:

1. En Render, abre el servicio y entra en **Environment**.
2. Añade `PAIRING_NUMBER` con el número de WhatsApp que vas a vincular, en formato internacional y solo dígitos (por ejemplo, `519XXXXXXXX`; sin `+`, espacios ni guiones).
3. Guarda y despliega/reinicia el servicio. En **Logs** aparecerá el código temporal de vinculación.
4. En el teléfono que tiene esa cuenta de WhatsApp, abre **Ajustes → Dispositivos vinculados → Vincular un dispositivo → Vincular con número de teléfono** e introduce el código mostrado en Render.
5. Cuando la conexión se complete, Baileys guardará las credenciales usando el almacenamiento configurado (`MONGODB_URI` si está disponible).

El código se solicita cuando Baileys emite el QR y el socket está listo, para evitar pedirlo demasiado pronto. Si prefieres usar QR, deja `PAIRING_NUMBER` sin configurar y abre el enlace privado `/qr?token=...` que aparece en los logs del servicio. El endpoint principal solo indica dónde encontrarlo; no publiques el token.

No compartas el código de vinculación ni las credenciales de sesión: permiten acceder a tu cuenta.

## Variables de entorno

Configura en el hosting las variables que ya utiliza el proyecto, como `MONGODB_URI`, `DECOLECTA_TOKEN`, `QR_ACCESS_TOKEN`, `PAIRING_NUMBER`, `AUTH_SESSION_NAME`, `AUTO_REPLY` y las variables de stickers. No publiques sus valores.

### Cambiar a una sesión de WhatsApp nueva sin borrar la anterior

`AUTH_SESSION_NAME` permite elegir una colección independiente de MongoDB para las credenciales de Baileys. Si no se configura, se conserva el nombre histórico `session_us` (colección `session_session_us`). Para probar una vinculación limpia, establece por ejemplo `AUTH_SESSION_NAME=drako_clean_20261112`; se utilizará la colección `session_drako_clean_20261112`, sin borrar ni sobrescribir la colección anterior. Usa un nombre nuevo por intento de sesión limpia y guarda el valor elegido para poder reutilizar esa sesión después. El nombre solo admite letras, números, guion y guion bajo (máximo 48 caracteres).

Si WhatsApp rechaza una sesión guardada, el panel muestra cómo iniciar una sesión nueva con un `AUTH_SESSION_NAME` distinto; la colección anterior no se borra. Los reintentos ante desconexiones transitorias usan espera progresiva y el panel limpia los QR que ya caducaron.

## Desarrollo y pruebas

```bash
npm install
npm test
npm start
```

Las pruebas usan el módulo integrado `node:test` de Node.js y no requieren servicios externos.
