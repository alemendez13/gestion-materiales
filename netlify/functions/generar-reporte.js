// RUTA: netlify/functions/generar-reporte.js

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
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Clave de API inválida.' }) };
    }
    
    try { 
        const { userEmail } = JSON.parse(event.body);
        if (!userEmail) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Email del usuario faltante.' }) };
        }

        const userRole = await getUserRole(userEmail);
        if (userRole !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. No tienes permisos de administrador.' }) };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        // Leemos catálogo, movimientos y solicitudes para un cálculo completo
        const [catalogRes, movementsRes] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'CATALOGO_INSUMOS!A:M' }),
            sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'MOVIMIENTOS!A:L' })
        ]);

        const catalogRows = (catalogRes.data.values || []).slice(1);
        const movementRows = (movementsRes.data.values || []).slice(1);

        if (catalogRows.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ totalInventoryValue: 0, lowStockItems: [] }) };
        }

        const stockMap = {};
        const costMap = {};
        
        movementRows.forEach(mov => {
            const itemId = mov[2]; // ID_Insumo
            const type = mov[3];   // Tipo_Movimiento
            const quantity = Number(mov[4]);
            const cost = Number(mov[5]); // Costo_Unitario

            if (!stockMap[itemId]) {
                stockMap[itemId] = 0;
            }

            if (type === 'Entrada') {
                stockMap[itemId] += quantity;
                // --- INICIO DE LA CORRECCIÓN ---
                // Se registra el costo unitario de la entrada.
                // Si hay múltiples entradas, este valor se sobrescribe,
                // asegurando que usemos el costo más reciente.
                costMap[itemId] = cost;
                // --- FIN DE LA CORRECCIÓN ---
            } else if (type === 'Salida') {
                stockMap[itemId] -= quantity;
            }
        });

        let totalInventoryValue = 0;
        const lowStockItems = [];

        catalogRows.forEach(item => {
            const id = item[1];       // B: ID_Insumo
            const name = item[3];     // D: Nombre_Producto
            const minStock = Number(item[7]) || 0; // H: Stock_Minimo
            
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