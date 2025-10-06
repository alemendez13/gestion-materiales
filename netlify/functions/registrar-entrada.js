// RUTA: netlify/functions/registrar-entrada.js

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
        // --- LA LÓGICA PARA REGISTRAR LA ENTRADA NO CAMBIA ---
        const entry = JSON.parse(event.body);

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