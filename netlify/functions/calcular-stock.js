/* netlify/functions/calcular-stock.js */
/**
 * CORREGIDO: Módulo de utilidad para calcular el stock "comprometido".
 * Esta función NO ES UN ENDPOINT, es un módulo de utilidad.
 * Ahora lee correctamente los índices de array (en lugar de propiedades de objeto)
 * e implementa la lógica de stock comprometido (Falla M-1).
 *
 * @param {string} insumoId - El ID único del insumo (ej. 'INS-123').
 * @param {Array<Array<string>>} movimientos - Array de filas de la hoja MOVIMIENTOS.
 * @param {Array<Array<string>>} solicitudes - Array de filas de la hoja SOLICITUDES.
 * @returns {number} El stock actual ajustado (comprometido).
 */
function calcularStockActual(insumoId, movimientos, solicitudes) {
    let stock = 0;

    // 1. Calcular el stock basado en MOVIMIENTOS (Libro Mayor)
    // Se asume que 'movimientos' es el array de filas (rows)
    if (movimientos && movimientos.length > 0) {
        for (const movimiento of movimientos) {
            // Se asume el formato de array de las funciones de la API
            const movInsumoId = movimiento[2]; // C: ID_Insumo
            const movTipo = movimiento[3];     // D: Tipo_Movimiento
            const movCantidad = parseInt(movimiento[4]); // E: Cantidad
    
            if (movInsumoId == insumoId) {
                if (isNaN(movCantidad)) {
                    console.warn(`Movimiento con ID ${movimiento[0]} tiene Cantidad no válida.`);
                    continue;
                }
                if (movTipo === 'Entrada') {
                    stock += movCantidad;
                } else if (movTipo === 'Salida') {
                    stock -= movCantidad;
                }
            }
        }
    }

    // --- INICIO DE LA CORRECCIÓN (Falla M-1) ---
    // 2. Ajustar el stock restando SOLO las SOLICITUDES PENDIENTES
    // Las 'Aprobadas' ya generaron una salida en MOVIMIENTOS, no se deben restar de nuevo.
    if (solicitudes && solicitudes.length > 0) {
        for (const solicitud of solicitudes) {
            const solInsumoId = solicitud[3]; 
            const solCantidad = parseInt(solicitud[4]); 
            const solEstatus = solicitud[5]; 

            // CORRECCIÓN: Solo restamos lo 'Pendiente' (Stock Comprometido)
            if (solInsumoId == insumoId && solEstatus === 'Pendiente') {
                 if (!isNaN(solCantidad)) {
                    stock -= solCantidad; 
                }
            }
        }
    }

    return stock;
}

module.exports = { calcularStockActual };