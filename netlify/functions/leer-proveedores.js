// RUTA: netlify/functions/leer-proveedores.js
const { google } = require('googleapis');
const { withAuth } = require('./auth');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

exports.handler = withAuth(async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        
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