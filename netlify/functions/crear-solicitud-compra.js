// RUTA: netlify/functions/crear-solicitud-compra.js

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

        // Validar que el usuario que solicita exista
        if (!data.userEmail) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Email del usuario faltante.' }) };
        }
        const userRole = await getUserRole(data.userEmail);
        if (!userRole) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Usuario no válido.' }) };
        }

        // Validar campos obligatorios del formulario
        if (!data.itemName || !data.quantity) {
            return { statusCode: 400, body: JSON.stringify({ error: 'El nombre del producto y la cantidad son obligatorios.' }) };
        }
        // --- Fin Bloque de Seguridad y Validación ---

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const newRequestId = 'COMPRA-' + new Date().getTime();
        const timestamp = new Date().toISOString();

        // Guardar en una nueva hoja llamada 'SOLICITUDES_COMPRA'
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            // Asumimos que la nueva hoja se llama 'SOLICITUDES_COMPRA'
            range: 'SOLICITUDES_COMPRA!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [
                        newRequestId,         // ID_Solicitud_Compra
                        timestamp,            // Timestamp
                        data.userEmail,       // Solicitante_Email
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
};