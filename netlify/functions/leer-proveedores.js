// RUTA: netlify/functions/leer-proveedores.js

const { withAuth } = require('./auth');
// IMPORTAMOS EL CLIENTE CENTRALIZADO
const { getSheetsClient } = require('./utils/google-client');

exports.handler = withAuth(async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const sheets = getSheetsClient();
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'CATALOGO_PROVEEDORES!A:H',
        });

        const rows = (response.data.values || []).slice(1); // Saltar encabezados

        const proveedores = rows.map(row => ({
            id: row[0],
            name: row[1],
            contact: row[2],
            email: row[4],
            // Parseamos el historial de precios (JSON) si existe, si no, objeto vacío
            priceHistory: row[7] ? JSON.parse(row[7]) : {}
        }));

        return { statusCode: 200, body: JSON.stringify(proveedores) };

    } catch (error) {
        console.error("Error leyendo proveedores:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error al cargar proveedores.' }) };
    }
});