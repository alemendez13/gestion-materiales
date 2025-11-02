// RUTA: netlify/functions/generar-responsiva.js

const { google } = require('googleapis');
// NUEVO: Importar 'withAuth'
const { withAuth } = require('./auth');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// MODIFICADO: Envolver con 'withAuth'
exports.handler = withAuth(async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // --- BLOQUE DE SEGURIDAD ANTIGUO ELIMINADO ---
    // 'x-api-key' es reemplazada por 'withAuth'

    try {
        const data = JSON.parse(event.body);
        const { assetId, responsibleName, responsibleEmail, conditions } = data;

        // --- INICIO LÓGICA DE AUTENTICACIÓN MEJORADA ---
        const userEmail = event.auth.email; // Email confiable del token
        const userRole = event.auth.role;   // Rol confiable del token

        if (userRole !== 'admin' && userRole !== 'supervisor') {
            return { statusCode: 403, body: JSON.stringify({ error: 'No tienes permisos para esta acción.' }) };
        }
        // --- FIN LÓGICA DE AUTENTICACIÓN ---

        // Validar datos obligatorios
        if (!assetId || !responsibleName || !responsibleEmail) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos obligatorios para la responsiva.' }) };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const timestamp = new Date().toISOString();

        // 1. Crear el registro en la hoja de RESPONSIVAS
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'RESPONSIVAS!A1', // Asegúrate de que esta hoja exista
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
                        userEmail // Email del supervisor que autoriza (AHORA ES SEGURO)
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
                        userEmail // Email del supervisor (AHORA ES SEGURO)
                    ]
                ],
            },
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Responsiva generada y salida de inventario registrada con éxito.' }) };

    } catch (error) {
        console.error('Error al generar responsiva:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
});