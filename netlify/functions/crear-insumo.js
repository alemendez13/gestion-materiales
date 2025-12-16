// RUTA: netlify/functions/crear-insumo.js

// NOTA: Ya no necesitamos importar 'google' aquí directamente, ni definir getAuth.
const { withAuth } = require('./auth');
// IMPORTAMOS NUESTRA NUEVA UTILIDAD
const { getSheetsClient } = require('./utils/google-client');
// IMPORTAMOS EL HELPER DE HOJAS (Fase 1.2 que hicimos antes)
const { getSheetWithHeaders, getValue } = require('./utils/sheet-helper');

exports.handler = withAuth(async (event) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try { 
        const item = JSON.parse(event.body);
        const userRole = event.auth.role; 

        if (userRole !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado.' }) };
        }
    
        if (!item.sku || !item.name || !item.family) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos obligatorios.' }) };
        }

        // --- AQUÍ ESTÁ LA MAGIA DE LA REFACTORIZACIÓN ---
        // Una sola línea para obtener el cliente listo
        const sheets = getSheetsClient(); 
        // -----------------------------------------------

        // VALIDACIÓN DE DUPLICADOS MEJORADA (Usando sheet-helper)
        const { rows, map } = await getSheetWithHeaders(
            sheets, 
            process.env.GOOGLE_SHEET_ID, 
            'CATALOGO_INSUMOS!A:C' // Solo necesitamos hasta SKU
        );

        // Buscamos en la columna 'sku' usando el mapa dinámico
        const skuExists = rows.some(row => {
            const rowSku = getValue(row, map, 'sku');
            return rowSku.trim().toLowerCase() === item.sku.trim().toLowerCase();
        });

        if (skuExists) {
            return { statusCode: 400, body: JSON.stringify({ error: 'El SKU ya existe.' }) };
        }
        
        const newItemId = 'INS-' + new Date().getTime();

        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'CATALOGO_INSUMOS!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [
                        '',                 
                        newItemId,          
                        "'" + item.sku,     
                        "'" + item.name,    
                        "'" + item.description, 
                        "'" + item.family,  
                        "'" + item.unit,    
                        item.minStock,      
                        item.maxStock,      
                        "'" + item.location,
                        'Activo',           
                        item.isAsset || false, 
                        "'" + item.serialNumber,
                        '' // Proveedor Sugerido (Vacio al crear)
                    ]
                ],
            },
        });
        
        return { statusCode: 200, body: JSON.stringify({ message: 'Insumo creado con éxito.' }) };

    } catch (error) {
        console.error('Error al crear insumo:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
});