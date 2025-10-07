// RUTA: netlify/functions/crear-insumo.js (MODIFICADO para Plan 2)

const { google } = require('googleapis');
// Importar auth.js (asumiendo que está en una ruta relativa)
const { getUserRole } = require('./auth'); 


// Esta función auxiliar para la autenticación se mantiene igual
const getAuth = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
};

exports.handler = async (event, context) => {

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // --- INICIO DEL BLOQUE DE SEGURIDAD (API KEY + GSHEETS ROLE) ---
    
    // 1. Validar la Clave de API enviada en el Header 'x-api-key'
    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Clave de API inválida.' }) };
    }

    try {
        // Obtenemos los datos del cuerpo: requestId, action, y ahora el email del administrador
        const { requestId, action, approverEmail } = JSON.parse(event.body); 
        
        // El email del usuario debe ser enviado por el frontend.
        if (!approverEmail) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Email del administrador faltante en la solicitud.' }) };
        }

        // 2. Validar el Rol del Usuario en Google Sheets
        const userRole = await getUserRole(approverEmail);
        
        if (userRole !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. No tienes permisos de administrador.' }) };
        }
        
        // --- FIN DEL NUEVO BLOQUE DE SEGURIDAD ---

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'SOLICITUDES!A:E',
        });

        const rows = response.data.values;
        const rowIndex = rows.findIndex(row => row[0] === requestId);

        if (rowIndex === -1) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Solicitud no encontrada.' }) };
        }

        if (action === 'Aprobada') {
            const requestData = rows[rowIndex];
            const itemId = requestData[3];
            const quantity = parseInt(requestData[4]);

            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'MOVIMIENTOS!A1',
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [
                        ['MOV-' + new Date().getTime(), new Date().toISOString(), itemId, 'Salida', -Math.abs(quantity), '', '', '', '', '', '', approverEmail]
                    ],
                },
            });
        }

        const rowNumber = rowIndex + 1;

        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `SOLICITUDES!F${rowNumber}:H${rowNumber}`, 
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [action, approverEmail, new Date().toISOString()]
                ],
            },
        });
        
        return { statusCode: 200, body: JSON.stringify({ message: 'Solicitud actualizada y movimiento registrado con éxito.' }) };

    } catch (error) {
        console.error('Error al actualizar:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};