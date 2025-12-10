// RUTA: netlify/functions/leer-catalogo.js

const { google } = require('googleapis');
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

exports.handler = withAuth(async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        // --- INICIO MODIFICACIÓN: RANGO AMPLIADO ---
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            // Ahora leemos hasta la columna N para obtener el Proveedor Sugerido
            range: 'CATALOGO_INSUMOS!A:N', 
        });
        // --- FIN MODIFICACIÓN ---

        const rows = (response.data.values || []).slice(1);

        const catalog = rows.map(row => ({
            id: row[1],
            sku: row[2],
            name: row[3],
            description: row[4],
            family: row[5],
            unit: row[6],
            minStock: row[7],
            isAsset: row[11],
            // --- INICIO MODIFICACIÓN: MAPEO NUEVO CAMPO ---
            suggestedProvider: row[13] || '' // Columna N (índice 13)
            // --- FIN MODIFICACIÓN ---
        }));

        return { statusCode: 200, body: JSON.stringify(catalog) };

    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno.' }) };
    }
});