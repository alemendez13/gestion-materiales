// RUTA: netlify/functions/generar-reporte.js

const { google } = require('googleapis');
// NUEVO: Importar 'withAuth'
const { withAuth } = require('./auth');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    // Solo se necesita leer
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const EXPIRATION_THRESHOLD_DAYS = 30;

// MODIFICADO: Envolver con 'withAuth'
exports.handler = withAuth(async (event) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // --- BLOQUE DE SEGURIDAD ANTIGUO ELIMINADO ---
    
    try { 
        // --- INICIO LÓGICA DE AUTENTICACIÓN MEJORADA ---
        const userRole = event.auth.role;

        if (userRole !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. No tienes permisos de administrador.' }) };
        }
        // --- FIN LÓGICA DE AUTENTICACIÓN ---

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // Leemos catálogo, movimientos, lotes y no perecederos
        const [catalogRes, movementsRes, lotsRes, nonPerishableRes] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'CATALOGO_INSUMOS!A:M' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'MOVIMIENTOS!A:L' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'LOTES!A:F' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'STOCK_NO_PERECEDERO!A:B' })
        ]);

        const catalogRows = (catalogRes.data.values || []).slice(1);
        const movementRows = (movementsRes.data.values || []).slice(1);
        const lotesRows = (lotsRes.data.values || []).slice(1);
        const nonPerishableRows = (nonPerishableRes.data.values || []);

        if (catalogRows.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ totalInventoryValue: 0, lowStockItems: [], expiringItems: [] }) };
        }

        // --- CÁLCULO 1: Valor de Inventario (Falla L-4 Corregida) ---
        // Usamos MOVIMIENTOS para el valor contable (Costo Promedio Ponderado)
        movementRows.sort((a, b) => new Date(a[1]) - new Date(b[1])); // Ordenar por fecha

        const inventoryValueState = {}; // Objeto para rastrear el valor
        movementRows.forEach(mov => {
            const itemId = mov[2];
            const type = mov[3];
            const quantity = Number(mov[4]);
            const cost = Number(mov[5]); // Columna F: Costo_Unitario

            if (!inventoryValueState[itemId]) {
                inventoryValueState[itemId] = { stock: 0, totalValue: 0 };
            }
            const currentState = inventoryValueState[itemId];

            if (type === 'Entrada') {
                currentState.stock += quantity;
                currentState.totalValue += quantity * cost;
            } else if (type === 'Salida') {
                const weightedAverageCost = currentState.stock > 0 ? currentState.totalValue / currentState.stock : 0;
                currentState.stock -= quantity;
                currentState.totalValue -= quantity * weightedAverageCost;
            }
        });
        
        let totalInventoryValue = 0;
        for (const itemId in inventoryValueState) {
            totalInventoryValue += inventoryValueState[itemId].totalValue;
        }

        // --- CÁLCULO 2: Stock Físico (Falla L-3 Corregida) ---
        // Usamos LOTES y STOCK_NO_PERECEDERO para el stock físico real
        const stockMap = {};
        lotesRows.forEach(lote => {
            const itemId = lote[1];
            const availableQty = parseInt(lote[3]) || 0;
            if (availableQty > 0) {
                if (!stockMap[itemId]) stockMap[itemId] = 0;
                stockMap[itemId] += availableQty;
            }
        });
        nonPerishableRows.forEach(item => {
            const itemId = item[0];
            const availableQty = parseInt(item[1]) || 0;
            if (availableQty > 0) {
                if (!stockMap[itemId]) stockMap[itemId] = 0;
                stockMap[itemId] += availableQty;
            }
        });

        // --- CÁLCULO 3: Próximos a Caducar (Lógica Original Correcta) ---
        const expiringItems = [];
        const today = new Date();
        const thresholdDate = new Date(today);
        thresholdDate.setDate(today.getDate() + EXPIRATION_THRESHOLD_DAYS);

        lotesRows.forEach(lote => {
            const itemId = lote[1];
            const availableQty = parseInt(lote[3]);
            const expirationDateStr = lote[4];

            if (availableQty > 0 && expirationDateStr) {
                const expirationDate = new Date(expirationDateStr);
                if (!isNaN(expirationDate.getTime()) && expirationDate <= thresholdDate) {
                    const catalogItem = catalogRows.find(row => row[1] === itemId);
                    const itemName = catalogItem ? catalogItem[3] : 'Desconocido';
                    
                    expiringItems.push({
                        name: itemName,
                        quantity: availableQty,
                        expirationDate: expirationDate.toLocaleDateString('es-MX')
                    });
                }
            }
        });

        // --- Ensamblado Final del Reporte ---
        const lowStockItems = [];
        catalogRows.forEach(item => {
            const id = item[1];
            const name = item[3];
            const minStock = Number(item[7]) || 0;
            
            // Se usa el 'stockMap' (Físico) para el stock bajo
            const currentStock = stockMap[id] || 0; 
            
            if (currentStock <= minStock) {
                lowStockItems.push({ name, stock: currentStock, minStock });
            }
        });

        return { 
            statusCode: 200, 
            body: JSON.stringify({ totalInventoryValue, lowStockItems, expiringItems }) 
        };

    } catch (error) {
        console.error("Error al generar reporte:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error al generar el reporte.' }) };
    }
});