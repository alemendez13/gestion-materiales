// RUTA: netlify/functions/obtener-borrador.js
const { google } = require('googleapis');
const { withAuth } = require('./auth');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'], // Read/Write por si necesitamos limpiar
});

exports.handler = withAuth(async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { draftId } = JSON.parse(event.body);
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        
        // Leer la hoja de borradores
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'ORDENES_BORRADOR!A:C', // ID, JSON, Estatus
        });

        const rows = response.data.values || [];
        // Buscar la fila que tenga el ID y esté Pendiente
        const draftRow = rows.find(row => row[0] === draftId && row[2] === 'Pendiente');

        if (!draftRow) {
            return { statusCode: 404, body: JSON.stringify({ error: 'La solicitud no existe o ya fue procesada.' }) };
        }

        // El contenido JSON está en la columna B (índice 1)
        const draftData = JSON.parse(draftRow[1]);

        return { statusCode: 200, body: JSON.stringify(draftData) };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
});