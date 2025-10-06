const { google } = require('googleapis');

// Helper para configurar la autenticación
const getAuth = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
};

exports.handler = async (event, context) => {
    // 1. Verificar que solo los administradores puedan usar esta función
    const { user } = context.clientContext;
    const roles = user?.app_metadata?.roles || [];
    if (!roles.includes('admin')) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado.' }) };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { requestId, action } = JSON.parse(event.body);
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // 2. Encontrar la fila que corresponde al ID de la solicitud
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'SOLICITUDES!A:H', // Leer todas las columnas de solicitudes
        });

        const rows = response.data.values;
        const rowIndex = rows.findIndex(row => row[0] === requestId && row[5] === 'Pendiente');

        if (rowIndex === -1) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Solicitud no encontrada o ya fue procesada.' }) };
        }

        const rowNumber = rowIndex + 1; // El índice es base 0, las filas de Sheets son base 1

        // 3. Actualizar el estatus, el aprobador y la fecha de decisión
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `SOLICITUDES!F${rowNumber}:H${rowNumber}`, // Columnas F (Estatus), G (Aprobador), H (Fecha)
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [action, user.email, new Date().toISOString()]
                ],
            },
        });
        
        return { statusCode: 200, body: JSON.stringify({ message: 'Solicitud actualizada con éxito.' }) };

    } catch (error) {
        console.error('Error al actualizar:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};