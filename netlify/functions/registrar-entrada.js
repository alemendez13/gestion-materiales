// RUTA: netlify/functions/registrar-entrada.js

const { withAuth } = require('./auth');
// IMPORTAMOS EL CLIENTE CENTRALIZADO
const { getSheetsClient } = require('./utils/google-client');

// MODIFICADO: Envolver con 'withAuth'
exports.handler = withAuth(async (event) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // --- BLOQUE DE SEGURIDAD ANTIGUO ELIMINADO ---
    // La validación de 'x-api-key' es manejada por 'withAuth'

    try {
        const item = JSON.parse(event.body);

        // --- INICIO DE LÓGICA DE AUTENTICACIÓN MEJORADA ---
        // Obtenemos el email y rol desde 'event.auth' (inyectado por withAuth)
        const userEmail = event.auth.email;
        const userRole = event.auth.role;

        if (userRole !== 'admin' && userRole !== 'supervisor') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. No tienes permisos para esta acción.' }) };
        }
        // --- FIN DE LÓGICA DE AUTENTICACIÓN ---
    
        // --- INICIO DE LA VALIDACIÓN "BLINDADA" (Se mantiene del original) ---
        
        if (!item.itemId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Debe seleccionar un insumo.' }) };
        }
        
        const quantity = parseInt(item.quantity);
        if (isNaN(quantity) || quantity <= 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'La cantidad debe ser un número mayor a cero.' }) };
        }

        const cost = parseFloat(item.cost);
        if (isNaN(cost) || cost < 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Debe ingresar un costo unitario válido (cero o mayor).' }) };
        }
        // --- FIN DE LA VALIDACIÓN "BLINDADA" ---

        const sheets = getSheetsClient();
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const timestamp = new Date().toISOString();


        // --- INICIO DE LA NUEVA LÓGICA DE TRANSACCIÓN (Corrigiendo L-1 y L-2) ---
            
        // Paso 1: Escribir en la hoja de stock físico PRIMERO.
        // Esto corrige la Falla L-1 (Lógica de Lotes Rota)
        if (item.expirationDate) {
            // Producto PERECEDERO, va a LOTES
            const newLotId = 'LOTE-' + new Date().getTime();
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'LOTES!A1',
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [
                        [
                            newLotId,
                            item.itemId,
                            quantity, // Cantidad_Inicial
                            quantity, // Cantidad_Disponible (inicialmente es la misma)
                            item.expirationDate,
                            timestamp
                        ]
                    ],
                },
            });
        } else {
            // Producto NO PERECEDERO, va a la hoja 'STOCK_NO_PERECEDERO'
            // Esta lógica busca el item; si existe, suma la cantidad; si no, crea la fila.
            
            const stockSheetRange = 'STOCK_NO_PERECEDERO!A:B';
            const stockResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: stockSheetRange });
            const stockRows = stockResponse.data.values || [];
            
            // +1 porque la hoja de Google Sheets no tiene encabezado (según plan)
            const rowIndex = stockRows.findIndex(row => row[0] === item.itemId); 

            if (rowIndex > -1) {
                // El item ya existe, sumar al stock
                const existingQty = parseInt(stockRows[rowIndex][1]) || 0;
                const newQty = existingQty + quantity;
                const rowToUpdate = rowIndex + 1; // +1 para índice 1-based de Sheets
                
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `STOCK_NO_PERECEDERO!B${rowToUpdate}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[newQty]] },
                });
            } else {
                // Item nuevo, añadirlo
                await sheets.spreadsheets.values.append({
                    spreadsheetId,
                    range: stockSheetRange,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[item.itemId, quantity]] },
                });
            }
        }

        // Paso 2: Escribir en el libro mayor (MOVIMIENTOS) DESPUÉS.
        // Esto corrige la Falla L-2 (Transacción). Si el Paso 1 falla, esto no se ejecuta.
        const newMovementId = 'MOV-' + new Date().getTime();
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'MOVIMIENTOS!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [
                        newMovementId, timestamp, item.itemId,
                        'Entrada', quantity, cost,
                        item.provider, item.invoice, item.expirationDate || '', // Dejar vacío si no hay
                        item.serialNumber, '', userEmail
                    ]
                ],
            },
        });
        // --- FIN DE LA NUEVA LÓGICA DE TRANSACCIÓN ---

        return { statusCode: 200, body: JSON.stringify({ message: 'Entrada registrada con éxito.' }) };

    } catch (error) {
        console.error('Error al registrar entrada:', error);
        // Si el Paso 1 falló (ej. permisos en LOTES), el Paso 2 (MOVIMIENTOS) no se ejecutó.
        // La base de datos permanece consistente.
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor al registrar la entrada.' }) };
    }
});