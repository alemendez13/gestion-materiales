const { google } = require('googleapis');

exports.handler = async (event) => {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'CATALOGO_INSUMOS!A:C', // Lee ID, SKU, y Nombre
        });

        const rows = response.data.values;
        if (!rows || rows.length < 2) { // Menos de 2 porque necesitamos la cabecera + al menos 1 dato
            return { statusCode: 200, body: JSON.stringify([]) };
        }

        // Convertir en un array de objetos
        const data = rows.slice(1).map(row => ({
            id: row[0],
            sku: row[1],
            name: row[2]
        }));

        return { statusCode: 200, body: JSON.stringify(data) };

    } catch (error) {
        console.error('Error al leer el catálogo:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error al leer el catálogo.' }) };
    }
};