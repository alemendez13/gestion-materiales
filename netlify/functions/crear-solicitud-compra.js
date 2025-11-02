// RUTA: netlify/functions/crear-solicitud-compra.js

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
    // 'withAuth' maneja la validación de la sesión.

    try {
        const data = JSON.parse(event.body);

        // --- INICIO LÓGICA DE AUTENTICACIÓN MEJORADA ---
        // Obtenemos el email del solicitante desde el token seguro.
        const userEmail = event.auth.email;
        
        // 'withAuth' ya validó que el usuario existe y tiene un rol,
        // por lo que cualquier usuario autenticado puede enviar una solicitud de compra.
        // --- FIN LÓGICA DE AUTENTICACIÓN ---

        // Validar campos obligatorios del formulario
        if (!data.itemName || !data.quantity) {
            return { statusCode: 400, body: JSON.stringify({ error: 'El nombre del producto y la cantidad son obligatorios.' }) };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const newRequestId = 'COMPRA-' + new Date().getTime();
        const timestamp = new Date().toISOString();

        // Guardar en la hoja 'SOLICITUDES_COMPRA'
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'SOLICITUDES_COMPRA!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [
                        newRequestId,         // ID_Solicitud_Compra
                        timestamp,            // Timestamp
                        userEmail,            // Solicitante_Email (AHORA ES SEGURO)
                        data.itemName,        // Nombre_Producto
                        data.quantity,        // Cantidad_Estimada
                        data.justification,   // Justificacion
                        data.especificaciones,// especificaciones
                        'Pendiente'           // Estatus
                    ]
                ],
            },
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Solicitud de compra creada con éxito.' }) };

    } catch (error) {
        console.error('Error al crear solicitud de compra:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
});