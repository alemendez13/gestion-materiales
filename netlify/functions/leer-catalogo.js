// RUTA: netlify/functions/leer-catalogo.js

const { google } = require('googleapis');

// Esta función auxiliar se mantiene igual
const getAuth = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
};

exports.handler = async (event, context) => {
    // --- INICIO DEL NUEVO BLOQUE DE SEGURIDAD ---

    // 1. Verificamos que un usuario haya iniciado sesión.
    //    Si no, no podrá ver el catálogo de insumos.
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Acceso no autorizado. Debes iniciar sesión para ver el catálogo.' }) };
    }
    // --- FIN DEL NUEVO BLOQUE DE SEGURIDAD ---

    try {
        // --- LA LÓGICA PARA LEER EL CATÁLOGO NO CAMBIA ---
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'CATALOGO_INSUMOS!A:G', // Lee las columnas relevantes del catálogo
        });

        const rows = response.data.values || [];
        if (rows.length === 0) {
            return { statusCode: 200, body: JSON.stringify([]) };
        }

        const headers = rows.shift(); // Saca la fila de encabezados

        // Mapeamos los resultados a un formato JSON limpio para el frontend
        const catalog = rows.map(row => ({
            id: row[0],
            sku: row[1],
            name: row[2],
            description: row[3],
            family: row[4],
            unit: row[5],
            minStock: row[6]
        }));

        return { statusCode: 200, body: JSON.stringify(catalog) };

    } catch (error) {
        console.error('Error al leer el catálogo:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};