const { google } = require('googleapis');
const { withAuth } = require('./auth');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

exports.handler = withAuth(async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    if (event.auth.role !== 'admin') return { statusCode: 403, body: 'Acceso denegado' };

    try {
        const data = JSON.parse(event.body);
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'CATALOGO_PROVEEDORES!A2',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[
                    `PROV-${Date.now()}`, // ID Automático
                    data.name,
                    data.contact,
                    data.phone,
                    data.email,
                    '', // Web
                    '', // Dirección
                    '{}' // Historial vacío
                ]]
            }
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Proveedor creado' }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
});