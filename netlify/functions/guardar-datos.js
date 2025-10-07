// RUTA: netlify/functions/guardar-datos.js

const { google } = require('googleapis');

// Esta función auxiliar se mantiene igual
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

    // --- INICIO DEL NUEVO BLOQUE DE SEGURIDAD (API KEY + GSHEETS ROLE) ---

    // 1. Validar la Clave de API enviada en el Header 'x-api-key'
    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Clave de API inválida.' }) };
    }

    try {
        const item = JSON.parse(event.body);

        // NOTA: El email del usuario debe ser enviado por el frontend en el cuerpo de la solicitud
        const userEmail = item.userEmail;
        if (!userEmail) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Email del usuario faltante en la solicitud.' }) };
        }

        // 2. Validar el Rol del Usuario en Google Sheets
        const userRole = await getUserRole(userEmail);
        
        if (userRole !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. No tienes permisos de administrador.' }) };
        }
        
        // --- FIN DEL NUEVO BLOQUE DE SEGURIDAD ---


        // Validamos que los datos esenciales estén presentes
        if (!newRow.id || !newRow.timestamp || !newRow.email || !newRow.item || !newRow.quantity) {
             return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos en la solicitud.' }) };
        }
        
        // Verificamos que el email de la solicitud coincida con el del usuario autenticado
        if (newRow.email.toLowerCase() !== user.email.toLowerCase()) {
            return { statusCode: 403, body: JSON.stringify({ error: 'No puedes crear solicitudes para otro usuario.' }) };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'SOLICITUDES!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [newRow.id, newRow.timestamp, newRow.email, newRow.item, newRow.quantity, 'Pendiente']
                ],
            },
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Datos guardados exitosamente.' }) };
    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};