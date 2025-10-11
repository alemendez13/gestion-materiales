// RUTA: netlify/functions/crear-insumo.js

const { google } = require('googleapis');
// Importar auth.js (asumiendo que está en una ruta relativa)
const { getUserRole } = require('./auth');

// Esta función auxiliar para la autenticación se mantiene igual
const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

exports.handler = async (event, context) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }


    // --- BLOQUE DE SEGURIDAD (API KEY + GSHEETS ROLE) ---

    // 1. Validar la Clave de API
    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Clave de API inválida.' }) };
    }
    
    // El 'try' debe comenzar AQUÍ para manejar la decodificación del JSON y la lógica de negocio
    try { 
        const item = JSON.parse(event.body);

        // Validar que el email venga en el body
        const userEmail = item.userEmail;
        if (!userEmail) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Email del usuario faltante en la solicitud.' }) };
        }

        // 2. Validar el Rol del Usuario en Google Sheets
        const userRole = await getUserRole(userEmail);
        
        if (userRole !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. No tienes permisos de administrador.' }) };
        }
    
        // --- LA LÓGICA PARA CREAR EL INSUMO NO CAMBIA ---

        if (!item.sku || !item.name || !item.family) {
            return { statusCode: 400, body: JSON.stringify({ error: 'SKU, Nombre y Familia son obligatorios.' }) };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        
        const newItemId = 'INS-' + new Date().getTime();

        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'CATALOGO_INSUMOS!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: 
                    [// --- CORRECCIÓN ---
                    // Se deja el primer campo vacío para la columna 'Folio'.
                    // El 'newItemId' se inserta en la segunda posición (columna 'ID_Insumo').
                    ['', newItemId, item.sku, item.name, item.description, item.family, item.unit, item.minStock, item.maxStock, 'Activo', item.isAsset, item.serialNumber]
                ],
            },
        });
        
        return { statusCode: 200, body: JSON.stringify({ message: 'Insumo creado con éxito.' }) };

    } catch (error) {
        console.error('Error al crear insumo:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};