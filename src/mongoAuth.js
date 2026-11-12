import { MongoClient } from 'mongodb';
import { BufferJSON, initAuthCreds, useMultiFileAuthState } from '@whiskeysockets/baileys';

/**
 * Autenticación persistente en MongoDB Atlas para Baileys.
 * Si no se proporciona uri o si la conexión falla, recurre a archivos locales en ./session_auth.
 */
export async function getAuthState(mongoUri, sessionName = 'default') {
    if (!mongoUri) {
        console.log('[AUTH] Usando almacenamiento local de sesión (./session_auth)');
        return await useMultiFileAuthState('./session_auth');
    }

    try {
        console.log('[AUTH] Conectando a MongoDB Atlas para sincronizar sesión...');
        const client = new MongoClient(mongoUri, {
            tls: true,
            serverSelectionTimeoutMS: 8000,
            connectTimeoutMS: 8000
        });

        await client.connect();
        console.log('[AUTH] ¡Conectado exitosamente a MongoDB Atlas!');

        const db = client.db('whatsapp_bot');
        const collection = db.collection(`session_${sessionName}`);

        const writeData = async (data, id) => {
            try {
                const payload = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
                await collection.updateOne(
                    { _id: id },
                    { $set: { value: payload } },
                    { upsert: true }
                );
            } catch (err) {
                console.error(`[AUTH] Error guardando ${id} en Mongo:`, err.message);
            }
        };

        const readData = async (id) => {
            try {
                const doc = await collection.findOne({ _id: id });
                if (doc && doc.value) {
                    const str = JSON.stringify(doc.value);
                    return JSON.parse(str, BufferJSON.reviver);
                }
                return null;
            } catch (error) {
                const recordType = id === 'creds' ? 'credenciales' : 'clave de sesión';
                console.error(`[AUTH] Error leyendo ${recordType} de Mongo (${error.name}): ${error.message}`);
                return null;
            }
        };

        const removeData = async (id) => {
            try {
                await collection.deleteOne({ _id: id });
            } catch (error) {
                console.error(`[AUTH] Error eliminando ${id} de Mongo:`, error.message);
            }
        };

        const storedCreds = await readData('creds');
        const creds = storedCreds || initAuthCreds();
        console.log(`[AUTH] Credenciales ${storedCreds ? 'recuperadas de MongoDB' : 'no encontradas; se inicializa una sesión nueva'}; registered=${Boolean(creds.registered)}`);

        return {
            state: {
                creds,
                keys: {
                    get: async (type, ids) => {
                        const data = {};
                        await Promise.all(
                            ids.map(async (id) => {
                                const value = await readData(`${type}-${id}`);
                                if (value) {
                                    data[id] = value;
                                }
                            })
                        );
                        return data;
                    },
                    set: async (data) => {
                        const tasks = [];
                        for (const category in data) {
                            for (const id in data[category]) {
                                const value = data[category][id];
                                const docId = `${category}-${id}`;
                                tasks.push(value ? writeData(value, docId) : removeData(docId));
                            }
                        }
                        await Promise.all(tasks);
                    }
                }
            },
            saveCreds: () => writeData(creds, 'creds')
        };
    } catch (err) {
        console.error('\n⚠️ [AUTH ERROR] No se pudo conectar a MongoDB Atlas:', err.message);
        console.log('REVISA EN MONGODB ATLAS:');
        console.log('1. En "Network Access", asegúrate de haber añadido IP "0.0.0.0/0" (Allow Access from Anywhere).');
        console.log('2. Si no añades 0.0.0.0/0, los servidores de Render son bloqueados por firewall con alerta SSL.\n');
        console.log('[AUTH] Activando fallback temporal a almacenamiento local (./session_auth)...\n');
        return await useMultiFileAuthState('./session_auth');
    }
}
