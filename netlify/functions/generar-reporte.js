const { google } = require('googleapis');

// (Puedes mover esta función a un archivo compartido en el futuro)
const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

exports.handler = async (event, context) => {
    // Seguridad: Solo los admins pueden acceder
    const { user } = context.clientContext;
    if (!user || !user.app_metadata.roles?.includes('admin')) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado.' }) };
    }

    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        // 1. Leer Catálogo y Movimientos al mismo tiempo
        const [catalogRes, movementsRes] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'CATALOGO_INSUMOS!A:G' }),
            sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'MOVIMIENTOS!A:F' })
        ]);

        const catalogRows = catalogRes.data.values || [];
        const movementRows = movementsRes.data.values || [];

        if (catalogRows.length < 2) return { statusCode: 200, body: JSON.stringify({ totalInventoryValue: 0, lowStockItems: [] }) };

        // 2. Procesar los datos
        const stockMap = {};
        const costMap = {};
        
        movementRows.slice(1).forEach(mov => {
            const itemId = mov[2];
            const type = mov[3];
            const quantity = Number(mov[4]);
            const cost = Number(mov[5]);

            // Calcular stock actual
            if (!stockMap[itemId]) stockMap[itemId] = 0;
            stockMap[itemId] += quantity; // Las salidas ya son negativas

            // Guardar el costo más reciente de cada producto
            if (type === 'Entrada') {
                costMap[itemId] = cost;
            }
        });

        let totalInventoryValue = 0;
        const lowStockItems = [];

        catalogRows.slice(1).forEach(item => {
            const id = item[0];
            const name = item[2];
            const minStock = Number(item[6]) || 0;
            
            const currentStock = stockMap[id] || 0;
            const lastCost = costMap[id] || 0;

            totalInventoryValue += currentStock * lastCost;

            if (currentStock <= minStock) {
                lowStockItems.push({ name, stock: currentStock, minStock });
            }
        });

        // 3. Devolver el reporte
        return { 
            statusCode: 200, 
            body: JSON.stringify({ totalInventoryValue, lowStockItems }) 
        };

    } catch (error) {
        console.error("Error al generar reporte:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error al generar el reporte.' }) };
    }
};