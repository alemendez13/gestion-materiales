// RUTA: netlify/functions/leer-catalogo.js

const { google } = require('googleapis');
// NUEVO: Importar 'withAuth'
// ANTIGUO: Ya no importamos 'getUserRole'
const { withAuth } = require('./auth');

const getAuth = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
};

// MODIFICADO: Envolver con 'withAuth'
exports.handler = withAuth(async (event) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // --- BLOQUE DE SEGURIDAD ANTIGUO ELIMINADO ---
    // 'withAuth' maneja la validación de la sesión.
    // Cualquier usuario logueado puede leer el catálogo.

    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'CATALOGO_INSUMOS!A:M', // Lee las columnas relevantes del catálogo
        });

        const rows = (response.data.values || []).slice(1);

        // La lógica de mapeo es la misma que la original
        const catalog = rows.map(row => ({
            id: row[1],          // B: ID_Insumo
            sku: row[2],         // C: SKU
            name: row[3],        // D: Nombre_Producto
            description: row[4], // E: Descripcion
            family: row[5],      // F: Familia
            unit: row[6],        // G: Unidad_Medida
            minStock: row[7],    // H: Stock_Minimo
            isAsset: row[11]     // L: Es_Activo
        }));

        return { statusCode: 200, body: JSON.stringify(catalog) };

    } catch (error) {
        console.error('Error al leer el catálogo:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
});