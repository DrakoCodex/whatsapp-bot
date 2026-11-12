import { MongoClient } from 'mongodb';
import { BufferJSON, initAuthCreds, useMultiFileAuthState } from '@whiskeysockets/baileys';

/**
 * Autenticación persistente en MongoDB Atlas para Baileys.
 * Si no se proporciona uri, recurre a archivos locales en ./session_auth.
 */
export async function getAuthState(mongoUri, sessionName = 'default') {
    if (!mongoUri) {
        console.log('[AUTH] Usando almacenamiento local de sesión (./session_auth)');
        return await useMultiFileAuthState('./session_auth');
    }

    console.log('[AUTH] Conectando a MongoDB Atlas para sincronizar sesión...');
    const client = new MongoClient(mongoUri);
    await client.connect();
    console.log('[AUTH] Conectado exitosamente a MongoDB Atlas.');

    const db = client.db('whatsapp_bot');
    const collection = db.collection(`session_${sessionName}`);

    const writeData = async (data, id) => {
        const payload = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
        await collection.updateOne(
            { _id: id },
            { $set: { value: payload } },
            { upsert: true }
        );
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
            console.error(`[AUTH] Error leyendo ${id} de Mongo:`, error.message);
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

    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                // Re-parse si es necesario
                            }
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
}
