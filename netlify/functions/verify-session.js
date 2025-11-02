// RUTA: netlify/functions/verify-session.js

const { google } = require('googleapis');
const { getUserRole } = require('./auth'); // Reutilizamos el módulo de autenticación

// Configuración del cliente de Google (con permisos de ESCRITURA para borrar el token)
const getAuth = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
};

exports.handler = async (event) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { token } = JSON.parse(event.body);

        if (!token) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Token requerido.' }) };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const range = 'LOGIN_TOKENS!A:C';

        // 1. Leer todos los tokens
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        const rows = response.data.values || [];
        const now = new Date();

        // 2. Buscar el token y su índice
        let foundTokenIndex = -1;
        let validTokenData = null;

        for (let i = 0; i < rows.length; i++) {
            const rowToken = rows[i][0]; // Columna A: Token
            const rowEmail = rows[i][1]; // Columna B: Email
            const rowExpires = new Date(rows[i][2]); // Columna C: Expires

            if (rowToken === token) {
                foundTokenIndex = i;
                if (now < rowExpires) {
                    // El token se encontró y NO ha expirado
                    validTokenData = { email: rowEmail, rowIndex: i + 1 }; // +1 porque los índices de Sheets empiezan en 1
                }
                break;
            }
        }

        // 3. Si el token es válido, proceder
        if (validTokenData) {
            
            // 4. (Seguridad) Borrar el token para que sea de un solo uso
            // Esto es asíncrono, no necesitamos esperar a que termine (fire-and-forget)
            // Usamos el API v4 'batchUpdate' para borrar la fila específica.
            sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [
                        {
                            deleteDimension: {
                                range: {
                                    sheetId: (await getSheetId(sheets, spreadsheetId, 'LOGIN_TOKENS')), // Necesitamos el ID numérico de la hoja
                                    dimension: 'ROWS',
                                    startIndex: validTokenData.rowIndex - 1, // El índice de la API es 0-based
                                    endIndex: validTokenData.rowIndex
                                }
                            }
                        }
                    ]
                }
            }).catch(err => console.error("Error al borrar el token:", err)); // Solo loggear el error, no bloquear al usuario

            // 5. Obtener el rol del usuario (doble verificación)
            const role = await getUserRole(validTokenData.email);

            if (!role) {
                 return { statusCode: 403, body: JSON.stringify({ error: 'Usuario válido pero sin rol asignado.' }) };
            }

            // 6. ¡Éxito! Devolver el perfil del usuario al frontend
            return {
                statusCode: 200,
                body: JSON.stringify({
                    email: validTokenData.email,
                    role: role
                })
            };

        } else {
            // El token no se encontró o ha expirado
            return { 
                statusCode: 403, 
                body: JSON.stringify({ error: 'Token inválido o expirado.' }) 
            };
        }

    } catch (error) {
        console.error('Error en verify-session:', error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'Error interno del servidor.' }) 
        };
    }
};

/**
 * Función auxiliar para obtener el ID numérico de una hoja (Sheet) por su nombre.
 * El API 'deleteDimension' requiere este ID.
 */
async function getSheetId(sheets, spreadsheetId, sheetName) {
    const response = await sheets.spreadsheets.get({
        spreadsheetId,
    });
    const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
    if (sheet) {
        return sheet.properties.sheetId;
    }
    throw new Error(`No se pudo encontrar el Sheet ID para la hoja: ${sheetName}`);
}