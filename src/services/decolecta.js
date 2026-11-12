import axios from 'axios';

const DECOLECTA_BASE_URL = 'https://api.decolecta.com/v1';

/**
 * Consulta información de persona por DNI en Reniec vía Decolecta.
 */
export async function consultarDni(numeroDni, token) {
    if (!token) {
        throw new Error('API Token de Decolecta no configurado.');
    }

    const cleanDni = String(numeroDni).trim().replace(/[^0-9]/g, '');
    if (cleanDni.length !== 8) {
        throw new Error('El DNI debe contener exactamente 8 dígitos numéricos.');
    }

    try {
        const response = await axios.get(`${DECOLECTA_BASE_URL}/reniec/dni`, {
            params: { numero: cleanDni },
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        return response.data;
    } catch (err) {
        if (err.response) {
            const status = err.response.status;
            if (status === 404) throw new Error(`DNI ${cleanDni} no encontrado.`);
            if (status === 401 || status === 403) throw new Error('Token de Decolecta inválido o sin créditos.');
            throw new Error(`Error en API Reniec: ${err.response.data?.message || err.message}`);
        }
        throw new Error(`Error de conexión con Reniec: ${err.message}`);
    }
}

/**
 * Consulta tipo de cambio oficial de Sunat vía Decolecta.
 * Puede consultar fecha específica (YYYY-MM-DD) o el día actual.
 */
export async function consultarTipoCambio(token, fecha = null) {
    if (!token) {
        throw new Error('API Token de Decolecta no configurado.');
    }

    try {
        const params = {};
        if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            params.date = fecha;
        }

        const response = await axios.get(`${DECOLECTA_BASE_URL}/tipo-cambio/sunat`, {
            params,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        return response.data;
    } catch (err) {
        if (err.response) {
            const status = err.response.status;
            if (status === 401 || status === 403) throw new Error('Token de Decolecta inválido o sin créditos.');
            throw new Error(`Error en API Sunat: ${err.response.data?.message || err.message}`);
        }
        throw new Error(`Error de conexión con Sunat: ${err.message}`);
    }
}
