// RUTA: netlify/functions/guardar-datos.js

const { withAuth } = require('./auth');
// IMPORTAMOS EL CLIENTE CENTRALIZADO
const { getSheetsClient } = require('./utils/google-client');

exports.handler = withAuth(async (event) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const item = JSON.parse(event.body);
        
        // --- VALIDACIÓN DE SEGURIDAD (Anti-Suplantación) ---
        // Nos aseguramos que quien envía la solicitud es quien dice ser
        if (item.email !== event.auth.email) {
             return { statusCode: 403, body: JSON.stringify({ error: 'No puedes realizar solicitudes a nombre de otro usuario.' }) };
        }

        // Validaciones básicas
        if (!item.itemName || !item.quantity) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos obligatorios.' }) };
        }

        // USAMOS EL CLIENTE CENTRALIZADO
        const sheets = getSheetsClient();
        
        const newItemId = 'SOL-' + new Date().getTime();
        const timestamp = new Date().toISOString();

        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'SOLICITUDES!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [
                        newItemId,
                        timestamp,
                        item.email,
                        item.itemId, // Guardamos ID_Insumo (SKU oculto)
                        item.quantity,
                        'Pendiente', // Estatus inicial
                        '', // Aprobador (vacio)
                        ''  // Fecha Aprobación (vacio)
                    ]
                ],
            },
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Solicitud guardada con éxito.' }) };

    } catch (error) {
        console.error('Error al guardar datos:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
});