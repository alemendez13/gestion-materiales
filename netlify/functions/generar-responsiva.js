// RUTA: netlify/functions/generar-responsiva.js

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

    // --- Bloque de Seguridad ---
    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Clave de API inválida.' }) };
    }

    try {
        const data = JSON.parse(event.body);
        const { userEmail, assetId, responsibleName, responsibleEmail, conditions } = data;

        if (!userEmail) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Email del usuario faltante.' }) };
        }

        const userRole = await getUserRole(userEmail);
        if (userRole !== 'admin' && userRole !== 'supervisor') {
            return { statusCode: 403, body: JSON.stringify({ error: 'No tienes permisos para esta acción.' }) };
        }

        // Validar datos obligatorios
        if (!assetId || !responsibleName || !responsibleEmail) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos obligatorios para la responsiva.' }) };
        }
        // --- Fin Bloque de Seguridad ---

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const timestamp = new Date().toISOString();

        // 1. Crear el registro en la hoja de RESPONSIVAS
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'RESPONSIVAS!A1', // Asegúrate de que esta hoja exista en tu Google Sheet
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [
                        'RES-' + new Date().getTime(),
                        timestamp,
                        assetId,
                        responsibleName,
                        responsibleEmail,
                        conditions,
                        userEmail // Email del supervisor que autoriza
                    ]
                ],
            },
        });

        // 2. Crear el movimiento de SALIDA en el inventario
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'MOVIMIENTOS!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [
                        'MOV-' + new Date().getTime(),
                        timestamp,
                        assetId,
                        'Salida',
                        1, // Los activos fijos siempre salen en cantidad de 1
                        0, // El costo de salida es 0
                        '', '', '', '', '',
                        userEmail
                    ]
                ],
            },
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Responsiva generada y salida de inventario registrada con éxito.' }) };

    } catch (error) {
        console.error('Error al generar responsiva:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};