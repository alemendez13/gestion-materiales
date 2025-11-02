// RUTA: netlify/functions/crear-insumo.js

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
    // La 'x-api-key' ha sido reemplazada por 'withAuth'

    try { 
        const item = JSON.parse(event.body);

        // --- INICIO LÓGICA DE AUTENTICACIÓN MEJORADA ---
        const userRole = event.auth.role; // Rol confiable del token

        if (userRole !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. No tienes permisos de administrador.' }) };
        }
        // --- FIN LÓGICA DE AUTENTICACIÓN ---
    
        if (!item.sku || !item.name || !item.family) {
            return { statusCode: 400, body: JSON.stringify({ error: 'SKU, Nombre y Familia son obligatorios.' }) };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        // --- LÓGICA ANTI-DUPLICADOS (Se mantiene del original) ---
        
        // 1. Leer la columna de SKUs (Columna C)
        const catalogResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'CATALOGO_INSUMOS!C:C', 
        });

        const allSkus = (catalogResponse.data.values || []).flat(); 

        // 2. Comprobar si el nuevo SKU ya existe
        if (allSkus.some(sku => sku.trim().toLowerCase() === item.sku.trim().toLowerCase())) {
            return { 
                statusCode: 400,
                body: JSON.stringify({ error: 'El SKU ingresado ya existe. No se puede duplicar.' }) 
            };
        }
        // --- FIN LÓGICA ANTI-DUPLICADOS ---
        
        const newItemId = 'INS-' + new Date().getTime();

        // --- LÓGICA DE PREVENCIÓN DE INYECCIÓN (Se mantiene del original) ---
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'CATALOGO_INSUMOS!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [
                        '',                 // A: Folio
                        newItemId,          // B: ID_INSUMO
                        "'" + item.sku,     // C: SKU (AÑADE COMILLA)
                        "'" + item.name,    // D: Nombre_Producto (AÑADE COMILLA)
                        "'" + item.description, // E: Descripcion (AÑADE COMILLA)
                        "'" + item.family,  // F: Familia (AÑADE COMILLA)
                        "'" + item.unit,    // G: Unidad_Medida (AÑADE COMILLA)
                        item.minStock,      // H: Stock_Minimo
                        item.maxStock,      // I: Stock_Maximo
                        "'" + item.location,// J: Ubicacion (AÑADE COMILLA)
                        'Activo',           // K: Estatus
                        item.isAsset || false, // L: Es_Activo
                        "'" + item.serialNumber // M: N_Serie (AÑADE COMILLA)
                    ]
                ],
            },
        });
        
        return { statusCode: 200, body: JSON.stringify({ message: 'Insumo creado con éxito.' }) };

    } catch (error) {
        console.error('Error al crear insumo:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
});