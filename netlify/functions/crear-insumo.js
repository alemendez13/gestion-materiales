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

        // --- INICIO DE LA MODIFICACIÓN 4 ---
// AÑADIR este bloque para leer la hoja ANTES de crear nada
        
        // 1. Leer la columna de SKUs (Columna C) para evitar duplicados
        const catalogResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'CATALOGO_INSUMOS!C:C', 
        });

        // flat() convierte el array de arrays (ej. [['SKU1'], ['SKU2']]) en un solo array (ej. ['SKU1', 'SKU2'])
        const allSkus = (catalogResponse.data.values || []).flat(); 

        // 2. Comprobar si el nuevo SKU (item.sku) ya existe en la lista
        if (allSkus.some(sku => sku.trim().toLowerCase() === item.sku.trim().toLowerCase())) {
            return { 
                statusCode: 400, // Error de "Solicitud Incorrecta"
                body: JSON.stringify({ error: 'El SKU ingresado ya existe. No se puede duplicar.' }) 
            };
        }
// --- FIN DE LA MODIFICACIÓN 4 ---
        
        const newItemId = 'INS-' + new Date().getTime();

        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'CATALOGO_INSUMOS!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
    // --- CÓDIGO FINAL Y DEFINITIVO ---
    // Este array ahora coincide con el orden exacto de las 13 columnas de tu hoja.
[
        '',                 // A: Folio (se deja vacío)
        newItemId,          // B: ID_INSUMO (No es texto de usuario, está bien)
        "'" + item.sku,     // C: SKU (AÑADE COMILLA)
        "'" + item.name,    // D: Nombre_Producto (AÑADE COMILLA)
        "'" + item.description, // E: Descripcion (AÑADE COMILLA)
        "'" + item.family,  // F: Familia (AÑADE COMILLA)
        "'" + item.unit,    // G: Unidad_Medida (AÑADE COMILLA)
        item.minStock,      // H: Stock_Minimo (Es número, no se toca)
        item.maxStock,      // I: Stock_Maximo (Es número, no se toca)
        "'" + item.location,// J: Ubicacion (AÑADE COMILLA)
        'Activo',           // K: Estatus (valor fijo)
        item.isAsset || false, // L: Es_Activo (Es booleano, no se toca)
        "'" + item.serialNumber // M: N_Serie (AÑADE COMILLA)
    ]
    // --- FIN DE LA CORRECCIÓN DE SEGURIDAD (P5) ---
                ],
            },
        });
        
        return { statusCode: 200, body: JSON.stringify({ message: 'Insumo creado con éxito.' }) };

    } catch (error) {
        console.error('Error al crear insumo:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};