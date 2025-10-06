const { google } = require('googleapis');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

exports.handler = async (event, context) => {
    // Seguridad: Solo los admins pueden acceder
    const { user } = context.clientContext;
    if (!user || !user.app_metadata.roles?.includes('admin')) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado.' }) };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const item = JSON.parse(event.body);

        // Validación simple
        if (!item.sku || !item.name || !item.family) {
            return { statusCode: 400, body: JSON.stringify({ error: 'SKU, Nombre y Familia son obligatorios.' }) };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        
        const newItemId = 'INS-' + new Date().getTime();

        // Añadir la nueva fila al catálogo
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'CATALOGO_INSUMOS!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    // El orden debe coincidir con tus columnas en CATALOGO_INSUMOS
                    [newItemId, item.sku, item.name, item.description, item.family, item.unit, item.minStock, item.maxStock, item.location, 'Activo']
                ],
            },
        });
        
        return { statusCode: 200, body: JSON.stringify({ message: 'Insumo creado con éxito.' }) };

    } catch (error) {
        console.error('Error al crear insumo:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};