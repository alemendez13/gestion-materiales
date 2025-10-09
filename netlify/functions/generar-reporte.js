const { google } = require('googleapis');
// Importar auth.js (asumiendo que está en una ruta relativa)
const { getUserRole } = require('./auth');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

exports.handler = async (event, context) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }


    // --- BLOQUE DE SEGURIDAD (API KEY + GSHEETS ROLE) ---

    // 1. Validar la Clave de API
    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Clave de API inválida.' }) };
    }
    
    // El 'try' debe comenzar AQUÍ para manejar la decodificación del JSON y la lógica de negocio
    try { 
        const item = JSON.parse(event.body);

        // Validar que el email venga en el body
        const userEmail = item.userEmail;
        if (!userEmail) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Email del usuario faltante en la solicitud.' }) };
        }

        // 2. Validar el Rol del Usuario en Google Sheets
        const userRole = await getUserRole(userEmail);
        
        if (userRole !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. No tienes permisos de administrador.' }) };
        }


    // --- FIN DEL BLOQUE CORREGIDO ---


        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        // 1. Leer Catálogo y Movimientos al mismo tiempo
        const [catalogRes, movementsRes] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'CATALOGO_INSUMOS!A:G' }),
            sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'MOVIMIENTOS!A:F' })
        ]);

        const catalogRows = (catalogRes.data.values || []).slice(1);
        const movementRows = (movementsRes.data.values || []).slice(1);

        if (catalogRows.length === 0) return { statusCode: 200, body: JSON.stringify({ totalInventoryValue: 0, lowStockItems: [] }) };

        // 2. Procesar los datos
        const stockMap = {};
        const costMap = {};
        
// CÓDIGO CORREGIDO
movementRows.forEach(mov => {
    const itemId = mov[2];
    const type = mov[3];
    const quantity = Number(mov[4]);
            const cost = Number(mov[5]);

    if (!stockMap[itemId]) stockMap[itemId] = 0;

    // Lógica estandarizada: suma si es 'Entrada', resta si es 'Salida'
    if (type === 'Entrada') {
        stockMap[itemId] += quantity;
    } else if (type === 'Salida') {
        stockMap[itemId] -= quantity;
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