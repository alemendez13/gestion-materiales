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
            range: 'SOLICITUDES!A:F', // Lee desde la columna A hasta la F
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return { statusCode: 200, body: JSON.stringify([]) };
        }

        // Convertir el array de arrays en un array de objetos
        const headers = rows[0];
        const data = rows.slice(1).map(row => {
            return {
                id: row[0],
                timestamp: row[1],
                email: row[2],
                item: row[3], // Asumiendo que la columna D es el nombre del item
                quantity: row[4],
                status: row[5]
            };
        });

        return { statusCode: 200, body: JSON.stringify(data) };

    } catch (error) {
        console.error('Error al leer datos:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error al leer los datos de la hoja de cálculo.' }) };
    }
};