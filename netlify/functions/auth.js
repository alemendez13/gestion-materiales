// RUTA: netlify/functions/auth.js

const { google } = require('googleapis');

/**
 * MODIFICADO: Cliente de autenticación de Google más flexible.
 * Acepta scopes para solicitar permisos de 'readonly' o de escritura.
 */
const getAuthClient = (scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly']) => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes,
    });
};

/**
 * MODIFICADO: Se mantiene la lógica, pero se limpian los logs de depuración.
 * Sigue siendo exportada para 'request-login.js' y 'verify-session.js'.
 */
const getUserRole = async (userEmail) => {
    if (!userEmail) {
        return null;
    }

    try {
        const auth = getAuthClient(); // readonly por defecto
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'USUARIOS!A:C',
        });

        const users = response.data.values || [];
        if (users.length > 0) {
            users.shift(); // Quitar encabezados
        }

        const userRow = users.find(row => row && row[0] && row[0].trim().toLowerCase() === userEmail.trim().toLowerCase());
        
        const role = userRow ? userRow[2].trim().toLowerCase() : null;
        
        return role;

    } catch (error) {
        console.error('Error Crítico en getUserRole:', error);
        return null;
    }
};
exports.getUserRole = getUserRole; // Exportar para las funciones de login


/**
 * NUEVO: Validador de Token de Sesión Interno.
 * Lee la hoja LOGIN_TOKENS y comprueba si un token es válido y no ha expirado.
 * Devuelve el perfil { email, role } si es válido, o null si no lo es.
 */
const validateSessionToken = async (token) => {
    if (!token) return null;

    try {
        const auth = getAuthClient(); // readonly es suficiente
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const range = 'LOGIN_TOKENS!A:C';

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        const rows = response.data.values || [];
        const now = new Date();

        // Buscar el token
        for (let i = 0; i < rows.length; i++) {
            const rowToken = rows[i][0];
            const rowEmail = rows[i][1];
            const rowExpires = new Date(rows[i][2]);

            if (rowToken === token) {
                // Token encontrado. ¿Ha expirado?
                if (now < rowExpires) {
                    // Token válido y no expirado. Obtener el rol.
                    const role = await getUserRole(rowEmail);
                    if (role) {
                        return { email: rowEmail, role: role };
                    }
                }
                // Token encontrado pero expirado
                return null; 
            }
        }
        // Token no encontrado
        return null;
    } catch (error) {
        console.error("Error en validateSessionToken:", error);
        return null;
    }
};


/**
 * NUEVO: Envoltorio (Middleware) de Autenticación.
 * Esta función envolverá todas las demás funciones de la API.
 */
exports.withAuth = (handler) => async (event, context) => {
    
    // 1. Extraer el token del header
    const authHeader = event.headers['authorization'];
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Autorización requerida.' }) };
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Token malformado.' }) };
    }

    // 2. Validar el token contra la hoja LOGIN_TOKENS
    const authProfile = await validateSessionToken(token);
    
    if (!authProfile) {
        // Si el token no es válido o expiró
        return { statusCode: 403, body: JSON.stringify({ error: 'Sesión inválida o expirada.' }) };
    }

    // 3. INYECCIÓN DE AUTENTICACIÓN
    // Inyectamos el perfil de usuario verificado en el evento.
    // Ahora, el 'handler' tendrá acceso a event.auth.email y event.auth.role
    event.auth = authProfile; 

    // 4. Ejecutar el handler original (ej. crear-insumo, leer-datos)
    return handler(event, context);
};