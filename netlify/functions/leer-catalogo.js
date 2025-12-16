// RUTA: netlify/functions/leer-catalogo.js

const { withAuth } = require('./auth');
// IMPORTAMOS EL CLIENTE CENTRALIZADO
const { getSheetsClient } = require('./utils/google-client');
// NUEVO: Importamos el helper
const { getSheetWithHeaders, getValue } = require('./utils/sheet-helper');

exports.handler = withAuth(async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const sheets = getSheetsClient();

        // --- USANDO EL NUEVO HELPER ---
        // Leemos hasta la Z para asegurar que traemos columnas futuras
        const { rows, map } = await getSheetWithHeaders(
            sheets, 
            process.env.GOOGLE_SHEET_ID, 
            'CATALOGO_INSUMOS!A:Z' 
        );

        const catalog = rows.map(row => ({
            // Ahora accedemos por NOMBRE DE COLUMNA, no por número.
            // Los nombres deben coincidir con la fila 1 de tu Excel (sin importar mayúsculas)
            id: getValue(row, map, 'id_insumo'),           // Antes row[1]
            sku: getValue(row, map, 'sku'),                 // Antes row[2]
            name: getValue(row, map, 'nombre_producto'),    // Antes row[3]
            description: getValue(row, map, 'descripcion'), // Antes row[4]
            family: getValue(row, map, 'familia'),          // Antes row[5]
            unit: getValue(row, map, 'unidad_medida'),      // Antes row[6]
            minStock: getValue(row, map, 'stock_minimo'),   // Antes row[7]
            isAsset: getValue(row, map, 'es_activo'),       // Antes row[11]
            
            // Aquí estaba el riesgo: row[13]. Ahora está blindado.
            // Si mueves la columna "Proveedor_Sugerido" a la columna Z, esto seguirá funcionando.
            suggestedProvider: getValue(row, map, 'proveedor_sugerido') 
        }));

        return { statusCode: 200, body: JSON.stringify(catalog) };

    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno.' }) };
    }
});