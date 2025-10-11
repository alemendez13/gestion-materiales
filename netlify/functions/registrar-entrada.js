// RUTA: netlify/functions/registrar-entrada.js

const { google } = require('googleapis');
const { getUserRole } = require('./auth');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

exports.handler = async (event) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Clave de API inválida.' }) };
    }

    try {
        const item = JSON.parse(event.body);

        const userEmail = item.userEmail;
        if (!userEmail) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Email del usuario faltante en la solicitud.' }) };
        }

        const userRole = await getUserRole(userEmail);
        if (userRole !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. No tienes permisos de administrador.' }) };
        }
    
        // --- INICIO DE LA CORRECCIÓN ---
        // Se mejora la validación para ser más específica y robusta.
        if (!item.itemId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Debe seleccionar un insumo.' }) };
        }
        if (!item.quantity || item.quantity <= 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'La cantidad debe ser un número mayor a cero.' }) };
        }
        if (item.cost === null || item.cost < 0) { // Permitimos costo 0 pero no nulo
            return { statusCode: 400, body: JSON.stringify({ error: 'Debe ingresar un costo unitario válido.' }) };
        }
        // --- FIN DE LA CORRECCIÓN ---

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        
        const newMovementId = 'MOV-' + new Date().getTime();

        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'MOVIMIENTOS!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [
                        newMovementId,
                        new Date().toISOString(),
                        item.itemId,
                        'Entrada',
                        Math.abs(item.quantity), 
                        item.cost,
                        item.provider,
                        item.invoice,
                        item.expirationDate,
                        item.serialNumber,
                        '', // ID_Solicitud (vacío para entradas)
                        userEmail
                    ]
                ],
            },
        });
        
        return { statusCode: 200, body: JSON.stringify({ message: 'Entrada registrada con éxito.' }) };

    } catch (error) {
        console.error('Error al registrar entrada:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};