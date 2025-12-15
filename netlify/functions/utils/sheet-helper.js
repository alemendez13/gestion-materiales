// RUTA: netlify/functions/utils/sheet-helper.js

/**
 * Obtiene los datos de una hoja y un mapa de columnas para acceder por nombre.
 * @param {object} sheets - Instancia del cliente de Google Sheets
 * @param {string} spreadsheetId - ID del documento
 * @param {string} range - Rango a leer (ej. 'CATALOGO_INSUMOS!A:Z')
 * @returns {Promise<{rows: Array, map: Object}>}
 */
async function getSheetWithHeaders(sheets, spreadsheetId, range) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });

    const allRows = response.data.values || [];
    if (allRows.length === 0) return { rows: [], map: {} };

    // Extraemos encabezados y normalizamos (trim + lowercase para evitar errores de dedo)
    const headers = allRows[0].map(h => h.toString().trim().toLowerCase());
    const dataRows = allRows.slice(1);

    // Creamos el mapa: { "sku": 2, "nombre_producto": 3, ... }
    // Nota: El índice es relativo al array de la fila, no a la columna de Excel (A=0, B=1...)
    const colMap = {};
    headers.forEach((header, index) => {
        colMap[header] = index;
    });

    return { rows: dataRows, map: colMap };
}

/**
 * Helper seguro para obtener valor.
 * @param {Array} row - La fila de datos
 * @param {Object} map - El mapa de columnas
 * @param {string} colName - El nombre de la columna deseada
 * @param {any} defaultValue - Valor por defecto si no existe
 */
function getValue(row, map, colName, defaultValue = '') {
    const index = map[colName.toLowerCase()];
    if (index === undefined) {
        console.warn(`Columna '${colName}' no encontrada en el mapa.`);
        return defaultValue;
    }
    return row[index] !== undefined ? row[index] : defaultValue;
}

module.exports = { getSheetWithHeaders, getValue };