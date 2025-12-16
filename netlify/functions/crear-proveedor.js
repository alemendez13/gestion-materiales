const { withAuth } = require('./auth');
// IMPORTAMOS EL CLIENTE CENTRALIZADO
const { getSheetsClient } = require('./utils/google-client');

exports.handler = withAuth(async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    if (event.auth.role !== 'admin') return { statusCode: 403, body: 'Acceso denegado' };

    try {
        const data = JSON.parse(event.body);
        const sheets = getSheetsClient();
        
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