// RUTA: netlify/functions/exportar-activos.js

const { google } = require('googleapis');
const { getUserRole } = require('./auth');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    // Se necesitan permisos de lectura y escritura para esta función
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

exports.handler = async (event) => {
    // Por seguridad, esta función solo puede ser llamada por un admin.
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado.' }) };
    }

    try {
        const { userEmail } = JSON.parse(event.body);
        if (!userEmail) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Email del usuario faltante.' }) };
        }

        const userRole = await getUserRole(userEmail);
        if (userRole !== 'admin') {
            return { statusCode: 403, body: JSON.stringify({ error: 'No tienes permisos de administrador.' }) };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // 1. Leer todo el catálogo de insumos
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'CATALOGO_INSUMOS!A:M',
        });

        const allItems = (response.data.values || []).slice(1); // Saltar encabezados

        // 2. Filtrar solo los que son activos fijos
        // La columna L (índice 11) es 'Es_Activo'
        // --- INICIO DE LA CORRECCIÓN ---
        // Se convierte el valor a String() para manejar tanto booleanos (true) como texto ("TRUE").
        const activeAssets = allItems.filter(item => item[11] && String(item[11]).toUpperCase() === 'TRUE');
        // --- FIN DE LA CORRECCIÓN ---

        if (activeAssets.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ message: 'No se encontraron activos fijos para exportar.' }) };
        }

        // 3. Preparar los datos para la exportación (solo las columnas necesarias)
        const dataToExport = activeAssets.map(asset => [
            asset[1], // B: ID_Insumo
            asset[2], // C: SKU
            asset[3], // D: Nombre_Producto
            asset[12] // M: N_Serie
        ]);

        // 4. Limpiar la hoja de destino antes de escribir los nuevos datos
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: 'EXPORT_ACTIVOS!A2:D', // Limpia desde la segunda fila hacia abajo
        });

        // 5. Escribir los datos filtrados en la nueva hoja
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
};