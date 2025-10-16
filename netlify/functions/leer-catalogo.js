// RUTA: netlify/functions/leer-catalogo.js

const { google } = require('googleapis');
// Importar auth.js (asumiendo que está en una ruta relativa)
const { getUserRole } = require('./auth');

// Esta función auxiliar se mantiene igual
const getAuth = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
};

exports.handler = async (event, context) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // --- INICIO DEL NUEVO BLOQUE DE SEGURIDAD (API KEY + GSHEETS ROLE) ---

    // 1. Validar la Clave de API enviada en el Header 'x-api-key'
    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Clave de API inválida.' }) };
    }

    try {
        const item = JSON.parse(event.body);

        // NOTA: El email del usuario debe ser enviado por el frontend en el cuerpo de la solicitud
        const userEmail = item.userEmail;
        if (!userEmail) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Email del usuario faltante en la solicitud.' }) };
        }

        // 2. Validar el Rol del Usuario en Google Sheets
        const userRole = await getUserRole(userEmail);
        
// CÓDIGO CORREGIDO
if (!userRole) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Usuario no válido.' }) };
}
        
        // --- FIN DEL NUEVO BLOQUE DE SEGURIDAD ---

        // --- LA LÓGICA PARA LEER EL CATÁLOGO NO CAMBIA ---
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'CATALOGO_INSUMOS!A:M', // Lee las columnas relevantes del catálogo
        });

        const rows = (response.data.values || []).slice(1);

// --- INICIO DE LA CORRECCIÓN ---
        // Se añade la propiedad "isAsset" al mapeo, leyendo la columna L (índice 11).
        const catalog = rows.map(row => ({
            id: row[1],          // B: ID_Insumo
            sku: row[2],         // C: SKU
            name: row[3],        // D: Nombre_Producto
            description: row[4], // E: Descripcion
            family: row[5],      // F: Familia
            unit: row[6],        // G: Unidad_Medida
            minStock: row[7],    // H: Stock_Minimo
            isAsset: row[11]     // L: Es_Activo  <- ✅ LÍNEA AÑADIDA
        }));
        // --- FIN DE LA CORRECCIÓN ---

        return { statusCode: 200, body: JSON.stringify(catalog) };

    } catch (error) {
        console.error('Error al leer el catálogo:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};