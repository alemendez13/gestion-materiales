// RUTA: netlify/functions/obtener-datos-compras.js

const { withAuth } = require('./auth');
// IMPORTAMOS EL CLIENTE CENTRALIZADO
const { getSheetsClient } = require('./utils/google-client');

exports.handler = withAuth(async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const userRole = event.auth.role;
    if (userRole !== 'admin' && userRole !== 'supervisor') {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado.' }) };
    }

    try {
        const sheets = getSheetsClient();
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // 1. Leer Catálogo, Lotes, No Perecederos y Solicitudes de Compra
        const [catalogRes, lotsRes, nonPerishRes, purchaseReqRes] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'CATALOGO_INSUMOS!A:M' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'LOTES!A:F' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'STOCK_NO_PERECEDERO!A:B' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'SOLICITUDES_COMPRA!A:H' })
        ]);

        // --- PROCESAR STOCK BAJO (Lógica reutilizada de reportes) ---
        const stockMap = {};
        const lotRows = (lotsRes.data.values || []).slice(1);
        const nonPerishRows = (nonPerishRes.data.values || []);

        lotRows.forEach(r => {
            const id = r[1]; const qty = parseInt(r[3]) || 0;
            if (qty > 0) stockMap[id] = (stockMap[id] || 0) + qty;
        });
        nonPerishRows.forEach(r => {
            const id = r[0]; const qty = parseInt(r[1]) || 0;
            if (qty > 0) stockMap[id] = (stockMap[id] || 0) + qty;
        });

        const lowStockItems = [];
        const catalogRows = (catalogRes.data.values || []).slice(1);
        
        catalogRows.forEach(row => {
            const id = row[1];
            const minStock = parseInt(row[7]) || 0;
            const current = stockMap[id] || 0;
            
            if (current <= minStock) {
                lowStockItems.push({
                    type: 'STOCK_BAJO',
                    id: id,
                    name: row[3],
                    sku: row[2],
                    currentStock: current,
                    minStock: minStock,
                    suggestedQty: (parseInt(row[8]) || minStock * 2) - current, // Sugerir llenar hasta MaxStock (col I) o doble de min
                    unit: row[6]
                });
            }
        });

        // --- PROCESAR SOLICITUDES DE COMPRA (Pendientes) ---
        const purchaseRequests = [];
        const reqRows = (purchaseReqRes.data.values || []).slice(1);
        
        reqRows.forEach((row, index) => {
            // Estructura: ID(0), Time(1), Email(2), Nombre(3), Cant(4), Justif(5), Espec(6), Estatus(7)
            if (row[7] === 'Pendiente') {
                purchaseRequests.push({
                    type: 'SOLICITUD',
                    id: row[0], // ID Solicitud
                    rowIndex: index + 2, // Para actualizar luego
                    requester: row[2],
                    name: row[3],
                    quantity: row[4],
                    justification: row[5],
                    specs: row[6]
                });
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ lowStockItems, purchaseRequests })
        };

    } catch (error) {
        console.error("Error obteniendo datos de compras:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
});