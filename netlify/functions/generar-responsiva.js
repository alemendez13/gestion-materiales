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
        const newResId = 'RES-' + new Date().getTime();

        // --- INICIO MODIFICACIÓN: REORDENAMIENTO DE COLUMNAS ---
        // Ajustado para coincidir con: ID | Fecha | ID_Activo | Nombre | Email | Condiciones | Autorizo
        const valuesToAppend = [
            [
                newResId,          // Col A: ID_Responsiva
                timestamp,         // Col B: Fecha
                assetId,           // Col C: ID_Activo
                responsibleName,   // Col D: Nombre_Responsable
                responsibleEmail,  // Col E: Email_Responsable
                conditions,        // Col F: Condiciones
                userEmail          // Col G: Email_Autoriza
            ]
        ];
        // --- FIN MODIFICACIÓN ---

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'RESPONSIVAS!A1',
            valueInputOption: 'USER_ENTERED',
            resource: { values: valuesToAppend },
        });

        // Registrar salida en MOVIMIENTOS (Sin cambios)
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'MOVIMIENTOS!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [
                        'MOV-' + new Date().getTime(),
                        timestamp, assetId, 'Salida', 1, 0,
                        '', '', '', '', '', userEmail
                    ]
                ],
            },
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Responsiva generada exitosamente.' }) };

    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno.' }) };
    }
});