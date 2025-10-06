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
    // --- INICIO DEL NUEVO BLOQUE DE SEGURIDAD ---

    // 1. Verificamos que un usuario haya iniciado sesión.
    //    Si no hay un objeto 'user' en el contexto, se deniega el acceso.
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Acceso no autorizado. Debes iniciar sesión para crear una solicitud.' }) };
    }
    // --- FIN DEL NUEVO BLOQUE DE SEGURIDAD ---

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // --- LA LÓGICA PARA GUARDAR LOS DATOS NO CAMBIA ---
        const newRow = JSON.parse(event.body);

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