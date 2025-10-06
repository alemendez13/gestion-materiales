const { google } = require('googleapis');

exports.handler = async (event) => {
    // Línea de depuración: Nos mostrará en la terminal qué método HTTP está recibiendo.
    console.log('Función invocada. Método HTTP:', event.httpMethod);

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const newRow = JSON.parse(event.body);

        if (!newRow.id || !newRow.timestamp || !newRow.email || !newRow.item || !newRow.quantity) {
             return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos en la solicitud.' }) };
        }

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'SOLICITUDES!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [newRow.id, newRow.timestamp, newRow.email, newRow.item, newRow.quantity, 'Pendiente']
                ],
            },
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Datos guardados exitosamente.' }) };
    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};