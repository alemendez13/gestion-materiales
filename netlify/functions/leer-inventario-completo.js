// RUTA: netlify/functions/leer-inventario-completo.js

const { google } = require('googleapis');
const { getUserRole } = require('./auth');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

exports.handler = async (event) => {
    // --- Bloque de Seguridad ---
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado.' }) };
    }

    try {
        const { userEmail } = JSON.parse(event.body);
        if (!userEmail || !(await getUserRole(userEmail))) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Usuario no válido.' }) };
        }
        // --- Fin Bloque de Seguridad ---

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // Leer catálogo y movimientos
        const [catalogRes, movementsRes] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'CATALOGO_INSUMOS!A:M' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'MOVIMIENTOS!A:L' })
        ]);

        const catalogRows = (catalogRes.data.values || []).slice(1);
        const movementRows = (movementsRes.data.values || []).slice(1);

        // Calcular el stock actual para cada producto
        const stockMap = {};
        movementRows.forEach(mov => {
            const itemId = mov[2]; // ID_Insumo
            const type = mov[3]; // Tipo_Movimiento
            const quantity = Number(mov[4]); // Cantidad
            if (!stockMap[itemId]) stockMap[itemId] = 0;
            stockMap[itemId] += (type === 'Entrada' ? quantity : -quantity);
        });

        // Mapear el catálogo con su stock calculado
        const fullInventory = catalogRows.map(item => ({
            sku: item[2] || 'N/A',
            name: item[3] || 'Sin Nombre',
            family: item[5] || 'N/A',
            stock: stockMap[item[1]] || 0 // item[1] es ID_Insumo
        }));

        return { statusCode: 200, body: JSON.stringify(fullInventory) };

    } catch (error) {
        console.error("Error al leer el inventario completo:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error al leer el inventario.' }) };
    }
};