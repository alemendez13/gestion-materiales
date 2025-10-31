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

// --- INICIO DE LA NUEVA FUNCIONALIDAD ---
// Se define un umbral en días para considerar un producto "próximo a caducar".
const EXPIRATION_THRESHOLD_DAYS = 30;
// --- FIN DE LA NUEVA FUNCIONALIDAD ---

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
            return { statusCode: 200, body: JSON.stringify({ totalInventoryValue: 0, lowStockItems: [], expiringItems: [] }) };
        }

        // 1. Ordenar los movimientos por fecha para un cálculo cronológico preciso.
        movementRows.sort((a, b) => new Date(a[1]) - new Date(b[1]));

        const inventoryState = {}; // Objeto para rastrear stock y valor por item.
        const expiringItems = [];
        const today = new Date();
        const thresholdDate = new Date(today);
        thresholdDate.setDate(today.getDate() + EXPIRATION_THRESHOLD_DAYS);

        movementRows.forEach(mov => {
            const itemId = mov[2];
            const type = mov[3];
            const quantity = Number(mov[4]);
            const cost = Number(mov[5]);
            const expirationDateStr = mov[8]; // I: Fecha_Caducidad

            // Inicializar el estado del item si no existe
            if (!inventoryState[itemId]) {
                inventoryState[itemId] = { stock: 0, totalValue: 0 };
            }

            const currentState = inventoryState[itemId];

            if (type === 'Entrada') {
                // Se añade la cantidad y el valor total de la nueva entrada.
                currentState.stock += quantity;
                currentState.totalValue += quantity * cost;


                                // --- INICIO DE LA NUEVA LÓGICA DE CADUCIDAD ---
                if (expirationDateStr) {
                    const expirationDate = new Date(expirationDateStr);
                    // Add a check to ensure date is valid
                    if (!isNaN(expirationDate.getTime()) && expirationDate <= thresholdDate) {
                        const catalogItem = catalogRows.find(row => row[1] === itemId);
                        const itemName = catalogItem ? catalogItem[3] : 'Desconocido';
                        
                        expiringItems.push({
                            name: itemName,
                            quantity: quantity,
                            expirationDate: expirationDate.toLocaleDateString('es-MX') // Formato dd/mm/aaaa
                        });
                    }
                }
                // --- FIN DE LA NUEVA LÓGICA DE CADUCIDAD ---
            

            } else if (type === 'Salida') {
                // Calcular el costo promedio ponderado en el momento de la salida.
                const weightedAverageCost = currentState.stock > 0 ? currentState.totalValue / currentState.stock : 0;
                
                // Se deduce el stock y el valor correspondiente a esa salida.
                currentState.stock -= quantity;
                currentState.totalValue -= quantity * weightedAverageCost;
            }
        });

        let totalInventoryValue = 0;
        const lowStockItems = [];

        for (const itemId in inventoryState) {
            totalInventoryValue += inventoryState[itemId].totalValue;
        }

        catalogRows.forEach(item => {
            const id = item[1];       // B: ID_Insumo
            const name = item[3];     // D: Nombre_Producto
            const minStock = Number(item[7]) || 0; // H: Stock_Minimo
            
            const currentStock = inventoryState[id] ? inventoryState[id].stock : 0;
            
            if (currentStock <= minStock) {
                lowStockItems.push({ name, stock: currentStock, minStock });
            }
        });

        // --- INICIO DE LA CORRECCIÓN ---
        // Se añade 'expiringItems' a la respuesta final del JSON.
        return { 
            statusCode: 200, 
            body: JSON.stringify({ totalInventoryValue, lowStockItems, expiringItems }) 
        };
        // --- FIN DE LA CORRECCIÓN ---

    } catch (error) {
        console.error("Error al generar reporte:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error al generar el reporte.' }) };
    }
};