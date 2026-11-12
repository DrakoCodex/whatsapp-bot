# WhatsApp Bot - Número US (Stickers, Reniec, Sunat & Utilidades)

Bot de WhatsApp optimizado para correr con números de EE.UU., persistencia en MongoDB Atlas para despliegues gratuitos en Render/Koyeb, consultas oficiales de Reniec / Sunat vía Decolecta, generador de stickers y utilidades.

## Lista de Comandos en WhatsApp

### 🇵🇪 Consultas Perú (Decolecta API)
| Comando | Descripción | Ejemplo |
| --- | --- | --- |
| `/dni <número>` | Consulta nombres completos, apellido paterno y materno en RENIEC | `/dni 46027897` |
| `/dolar` o `/tc` o `/sunat` | Tipo de cambio oficial SUNAT del día (compra / venta) | `/dolar` |
| `/dolar YYYY-MM-DD` | Tipo de cambio oficial en una fecha específica | `/dolar 2026-05-10` |

### 🎨 Stickers & Multimedia
| Comando | Descripción |
| --- | --- |
| `/s` o `/sticker` | Convierte la foto enviada o citada en un sticker WebP (512x512) |
| `/qr <texto o link>` | Genera una imagen con código QR listo para escanear |

### 🛠️ Utilidades & Herramientas
| Comando | Descripción | Ejemplo |
| --- | --- | --- |
| `/calc <operación>` | Calculadora matemática rápida | `/calc 150 * 3.41` |
| `/clima <ciudad>` | Clima y temperatura en tiempo real | `/clima Lima` |

### ⚙️ Sistema
| Comando | Descripción |
| --- | --- |
| `/menu` o `/ayuda` | Despliega el menú con todos los comandos disponibles |
| `/ping` | Mide la latencia de respuesta del bot |
| `/info` | Muestra estado de memoria, tiempo activo y modo de sesión |

---

## Configuración de MongoDB Atlas (Persistencia Gratuita para Render)

1. En tu panel de MongoDB Atlas, ve a **Database** y haz clic en **Connect**.
2. Selecciona **Drivers**.
3. Selecciona Driver: **Node.js** (Versión 5.5 o posterior).
4. Copia la cadena de conexión (*Connection String*), que tiene esta forma:
   ```text
   mongodb+srv://<usuario>:<password>@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```
5. Reemplaza `<usuario>` y `<password>` con tu usuario de base de datos.
6. En **Network Access** (menú izquierdo de MongoDB Atlas), haz clic en **Add IP Address** y elige **Allow Access from Anywhere** (`0.0.0.0/0`) para que Render pueda conectarse.
7. Agrega esa URL en tu `.env` o en las variables de entorno de Render como `MONGODB_URI`.
