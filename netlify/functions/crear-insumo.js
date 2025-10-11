// RUTA: netlify/functions/crear-insumo.js

const { google } = require('googleapis');
const { getUserRole } = require('./auth');

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
                values: [
                    // --- CÓDIGO CORREGIDO ---
                    // Este array ahora coincide con el orden exacto de las 12 columnas de tu hoja.
                    [
                        '',                 // A: Folio (se deja vacío)
                        newItemId,          // B: ID_INSUMO
                        item.sku,           // C: SKU
                        item.name,          // D: Nombre_Producto
                        item.description,   // E: Descripcion
                        item.family,        // F: Familia
                        item.unit,          // G: Unidad_Medida
                        item.minStock,      // H: Stock_Minimo
                        item.maxStock,      // I: Stock_Maximo
                        item.location,      // J: Ubicacion
                        'Activo',           // K: Estatus (valor fijo)
                        item.isAsset || false // L: Es_Activo (se asume un valor booleano)
                    ]
                ],
            },
        });
        
        return { statusCode: 200, body: JSON.stringify({ message: 'Insumo creado con éxito.' }) };

    } catch (error) {
        console.error('Error al crear insumo:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};