// RUTA: netlify/functions/generar-reporte.js

const { google } = require('googleapis');
// Asegúrate de que la ruta a tu nuevo archivo de utilidades sea correcta
const { getUserRole } = require('./utils/auth'); 

// Esta función se mantiene igual que en tu código original
const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

exports.handler = async (event, context) => {
    // --- INICIO DEL NUEVO BLOQUE DE SEGURIDAD ---

    // 1. Verificamos que un usuario haya iniciado sesión.
    const user = context.clientContext && context.clientContext.user;
    if (!user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Acceso no autorizado. Debes iniciar sesión.' }) };
    }

    // 2. Consultamos el rol del usuario en Google Sheets usando su email.
    const userRole = await getUserRole(user.email);
    
    // 3. Verificamos si el rol obtenido es 'admin'.
    if (userRole !== 'admin') {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. No tienes permisos de administrador.' }) };
    }
    // --- FIN DEL NUEVO BLOQUE DE SEGURIDAD ---

    try {
        // --- LA LÓGICA PARA GENERAR EL REPORTE NO CAMBIA ---
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const [catalogRes, movementsRes] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'CATALOGO_INSUMOS!A:G' }),
            sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'MOVIMIENTOS!A:F' })
        ]);

        const catalogRows = (catalogRes.data.values || []).slice(1);
        const movementRows = (movementsRes.data.values || []).slice(1);

        if (catalogRows.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ totalInventoryValue: 0, lowStockItems: [] }) };
        }
        
        const stockMap = {};
        const costMap = {};
        
        movementRows.forEach(mov => {
            const itemId = mov[2];
            const type = mov[3];
            const quantity = Number(mov[4]);
            const cost = Number(mov[5]);

            if (!stockMap[itemId]) stockMap[itemId] = 0;
            stockMap[itemId] += quantity;

            if (type === 'Entrada') {
                costMap[itemId] = cost;
            }
        });

        let totalInventoryValue = 0;
        const lowStockItems = [];

        catalogRows.forEach(item => {
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

        return { 
            statusCode: 200, 
            body: JSON.stringify({ totalInventoryValue, lowStockItems }) 
        };

    } catch (error) {
        console.error("Error al generar reporte:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error al generar el reporte.' }) };
    }
};