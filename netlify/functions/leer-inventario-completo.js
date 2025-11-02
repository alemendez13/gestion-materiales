// RUTA: netlify/functions/leer-inventario-completo.js

const { google } = require('googleapis');
// NUEVO: Importar 'withAuth'
const { withAuth } = require('./auth');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

// MODIFICADO: Envolver con 'withAuth'
exports.handler = withAuth(async (event) => {
    // --- Bloque de Seguridad ---
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    
    // --- BLOQUE DE SEGURIDAD ANTIGUO ELIMINADO ---
    // 'withAuth' maneja la sesión. Cualquier usuario logueado puede ver el inventario.

    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // --- INICIO DE LA LÓGICA DE CORRECCIÓN (Falla L-3) ---
        // Leer catálogo Y las dos hojas de stock físico
        const [catalogRes, lotsRes, nonPerishableRes] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'CATALOGO_INSUMOS!A:M' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'LOTES!A:F' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'STOCK_NO_PERECEDERO!A:B' })
        ]);

        const catalogRows = (catalogRes.data.values || []).slice(1);
        const lotRows = (lotsRes.data.values || []).slice(1);
        const nonPerishableRows = (nonPerishableRes.data.values || []);

        // Calcular el stock físico real desde las hojas de stock
        const stockMap = {};

        // 1. Sumar stock de LOTES (Perecederos)
        lotRows.forEach(lote => {
            const itemId = lote[1]; // B: ID_Insumo
            const availableQty = parseInt(lote[3]) || 0; // D: Cantidad_Disponible
            if (availableQty > 0) {
                if (!stockMap[itemId]) stockMap[itemId] = 0;
                stockMap[itemId] += availableQty;
            }
        });

        // 2. Sumar stock de STOCK_NO_PERECEDERO
        nonPerishableRows.forEach(item => {
            const itemId = item[0]; // A: ID_Insumo
            const availableQty = parseInt(item[1]) || 0; // B: Cantidad_Disponible
            if (availableQty > 0) {
                if (!stockMap[itemId]) stockMap[itemId] = 0;
                stockMap[itemId] += availableQty;
            }
        });
        // --- FIN DE LA LÓGICA DE CORRECCIÓN ---

        // Mapear el catálogo con su stock unificado
        const fullInventory = catalogRows.map(item => ({
            sku: item[2] || 'N/A',
            name: item[3] || 'Sin Nombre',
            family: item[5] || 'N/A',
            stock: stockMap[item[1]] || 0 // item[1] es ID_Insumo
        }));

        return { statusCode: 200, body: JSON.stringify(fullInventory) };

    } catch (error) {
        console.error("Error al leer el inventario completo:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error al leer el inventario.' }) };
    }
});