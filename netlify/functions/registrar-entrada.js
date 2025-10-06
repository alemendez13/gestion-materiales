const { google } = require('googleapis');

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
    // 1. Verificar que el usuario sea administrador
    const { user } = context.clientContext;
    const roles = user?.app_metadata?.roles || [];
    if (!roles.includes('admin')) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado.' }) };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { itemId, quantity, cost } = JSON.parse(event.body);
        if (!itemId || !quantity || quantity <= 0 || cost < 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Datos de entrada inválidos.' }) };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        
        const newMovementId = 'MOV-' + new Date().getTime();
        const timestamp = new Date().toISOString();

        // 2. Añadir la nueva fila a la pestaña de MOVIMIENTOS
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'MOVIMIENTOS!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    // Debe coincidir con el orden de columnas en tu pestaña MOVIMIENTOS
                    [newMovementId, timestamp, itemId, 'Entrada', quantity, cost, '', '', '', '', '', user.email]
                ],
            },
        });
        
        return { statusCode: 200, body: JSON.stringify({ message: 'Entrada registrada con éxito.' }) };

    } catch (error) {
        console.error('Error al registrar entrada:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};