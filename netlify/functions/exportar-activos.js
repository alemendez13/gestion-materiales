// RUTA: netlify/functions/exportar-activos.js

const { withAuth } = require('./auth');
// IMPORTAMOS EL CLIENTE CENTRALIZADO
const { getSheetsClient } = require('./utils/google-client');

// MODIFICADO: Envolver con 'withAuth'
exports.handler = withAuth(async (event) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // --- BLOQUE DE SEGURIDAD ANTIGUO ELIMINADO ---
    // 'x-api-key' es reemplazada por 'withAuth'

    try {
        // --- INICIO LÓGICA DE AUTENTICACIÓN MEJORADA ---
        const userRole = event.auth.role; // Rol confiable del token

        if (userRole !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'No tienes permisos de administrador.' }) };
        }
        // --- FIN LÓGICA DE AUTENTICACIÓN ---

        const sheets = getSheetsClient();
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // --- LÓGICA DE NEGOCIO (Sin cambios) ---

        // 1. Leer todo el catálogo de insumos
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'CATALOGO_INSUMOS!A:M',
        });

        const allItems = (response.data.values || []).slice(1); // Saltar encabezados

        // 2. Filtrar solo los que son activos fijos
        const activeAssets = allItems.filter(item => item[11] && String(item[11]).toUpperCase() === 'TRUE');

        if (activeAssets.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ message: 'No se encontraron activos fijos para exportar.' }) };
        }

        // 3. Preparar los datos para la exportación
        const dataToExport = activeAssets.map(asset => [
            asset[1], // B: ID_Insumo
            asset[2], // C: SKU
            asset[3], // D: Nombre_Producto
            asset[12] // M: N_Serie
        ]);

        // 4. Limpiar la hoja de destino
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: 'EXPORT_ACTIVOS!A2:D', 
        });

        // 5. Escribir los datos filtrados
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'EXPORT_ACTIVOS!A2',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: dataToExport,
            },
        });

        return { statusCode: 200, body: JSON.stringify({ message: `Se exportaron ${activeAssets.length} activos correctamente.` }) };

    } catch (error) {
        console.error("Error al exportar activos:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error al exportar los activos.' }) };
    }
});