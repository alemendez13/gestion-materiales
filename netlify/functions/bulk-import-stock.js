// RUTA: netlify/functions/bulk-import-stock.js

const { google } = require('googleapis');
const { withAuth } = require('./auth');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Función auxiliar para la lógica de registro (copiada de registrar-entrada.js)
// Esto asegura que ambas funciones sigan EXACTAMENTE las mismas reglas de negocio.
const registerItemEntry = async (sheets, spreadsheetId, item, userEmail) => {
    
    const quantity = parseInt(item.quantity);
    const cost = parseFloat(item.cost);
    const timestamp = new Date().toISOString();

    if (isNaN(quantity) || quantity <= 0 || isNaN(cost) || cost < 0) {
        throw new Error(`Datos inválidos para ${item.itemId}: Cantidad o Costo no son números válidos.`);
    }

    // Paso 1: Escribir en la hoja de stock físico (LOTES o NO_PERECEDERO)
    if (item.expirationDate) {
        const newLotId = 'LOTE-' + new Date().getTime();
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'LOTES!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [newLotId, item.itemId, quantity, quantity, item.expirationDate, timestamp]
                ],
            },
        });
    } else {
        const stockSheetRange = 'STOCK_NO_PERECEDERO!A:B';
        const stockResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: stockSheetRange });
        const stockRows = stockResponse.data.values || [];
        const rowIndex = stockRows.findIndex(row => row[0] === item.itemId); 

        if (rowIndex > -1) {
            const existingQty = parseInt(stockRows[rowIndex][1]) || 0;
            const newQty = existingQty + quantity;
            const rowToUpdate = rowIndex + 1;
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `STOCK_NO_PERECEDERO!B${rowToUpdate}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[newQty]] },
            });
        } else {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: stockSheetRange,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[item.itemId, quantity]] },
            });
        }
    }

    // Paso 2: Escribir en el libro mayor (MOVIMIENTOS)
    const newMovementId = 'MOV-' + new Date().getTime();
    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'MOVIMIENTOS!A1',
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: [
                [
                    newMovementId, timestamp, item.itemId,
                    'Entrada', quantity, cost,
                    item.provider || 'Importación Masiva', item.invoice || '', 
                    item.expirationDate || '', item.serialNumber || '', '', userEmail
                ]
            ],
        },
    });
};


// Handler principal
exports.handler = withAuth(async (event) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const userRole = event.auth.role;
        const userEmail = event.auth.email;
        if (userRole !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado.' }) };
        }
        
        const items = JSON.parse(event.body);
        if (!Array.isArray(items) || items.length === 0) {
             return { statusCode: 400, body: JSON.stringify({ error: 'No se encontraron items para importar.' }) };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        // Procesar cada item uno por uno
        for (const item of items) {
            try {
                // El frontend debe enviar 'itemId', 'quantity', 'cost', y opcional 'expirationDate'
                if (!item.itemId || !item.quantity || item.cost === undefined) {
                    throw new Error(`Faltan datos (itemId, quantity, cost)`);
                }
                await registerItemEntry(sheets, spreadsheetId, item, userEmail);
                successCount++;
            } catch (err) {
                console.error(`Error procesando item ${item.itemId}:`, err.message);
                errorCount++;
                errors.push(`Item ${item.itemId || 'desconocido'}: ${err.message}`);
            }
        }

        return { 
            statusCode: 200, 
            body: JSON.stringify({ 
                message: `Importación completada. Éxitos: ${successCount}. Errores: ${errorCount}.`,
                errors: errors
            }) 
        };

/* INICIO DE CORRECCIÓN: Implementar log de errores detallado */

    } catch (error) {
        console.error('Error en importación masiva:', error);
        
        // En lugar de un error genérico, enviamos el mensaje de error real
        // y el stack trace al frontend.
        return { 
            statusCode: 500, 
            body: JSON.stringify({ 
                error: `Error interno: ${error.message}`,
                stack: error.stack 
            }) 
        };
    }
/* FIN DE CORRECCIÓN */
});