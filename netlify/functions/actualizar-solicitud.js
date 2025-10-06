// RUTA: netlify/functions/actualizar-solicitud.js

const { google } = require('googleapis');
// Asegúrate de que la ruta a tu nuevo archivo de utilidades sea correcta
const { getUserRole } = require('./utils/auth');

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
    // --- INICIO DEL NUEVO BLOQUE DE SEGURIDAD ---

    // 1. Verificamos que un usuario haya iniciado sesión.
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Acceso no autorizado. Debes iniciar sesión.' }) };
    }

    // 2. Consultamos el rol del usuario en Google Sheets.
    const userRole = await getUserRole(user.email);
    
    // 3. Verificamos si el rol es 'admin'.
    if (userRole !== 'admin') {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. No tienes permisos de administrador.' }) };
    }
    // --- FIN DEL NUEVO BLOQUE DE SEGURIDAD ---

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // --- LA LÓGICA PARA ACTUALIZAR LA SOLICITUD NO CAMBIA ---
        const { requestId, action } = JSON.parse(event.body);
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
        
        const approverEmail = user.email; // Obtenemos el email del admin directamente del contexto

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