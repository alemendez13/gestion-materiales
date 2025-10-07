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


        if (!entry.itemId || !entry.quantity || !entry.cost) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Insumo, Cantidad y Costo son obligatorios.' }) };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        
        const newMovementId = 'MOV-' + new Date().getTime();
        const approverEmail = user.email; // Email del admin que registra

        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'MOVIMIENTOS!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [
                        newMovementId,
                        new Date().toISOString(),
                        entry.itemId,
                        'Entrada',
                        Math.abs(entry.quantity), // Aseguramos que la cantidad sea positiva
                        entry.cost,
                        entry.provider,
                        entry.invoice,
                        entry.expirationDate,
                        entry.serialNumber,
                        '', // Columna vacía para notas si es necesario
                        approverEmail
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