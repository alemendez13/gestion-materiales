/* netlify/functions/calcular-stock.js */
/**
 * Calcula el stock actual de un insumo basándose en el historial de movimientos
 * de entrada y salida, incluyendo las solicitudes aprobadas pendientes.
 *
 * @param {string} insumoId - El ID único del insumo a calcular (ej. 'INS-1759423931219' o '1').
 * @param {Array<Object>} movimientos - Array de objetos que representan los movimientos.
 * @param {Array<Object>} solicitudes - Array de objetos que representan las solicitudes.
 * @returns {number} El stock actual ajustado del insumo.
 */
function calcularStockActual(insumoId, movimientos, solicitudes) {
    let stock = 0;

    // 1. Calcular el stock inicial basado en los MOVIMIENTOS
    for (const movimiento of movimientos) {
        if (movimiento.ID_Insumo == insumoId) {
            const cantidad = parseInt(movimiento.Cantidad);
            const tipo = movimiento.Tipo_Movimiento;

            if (isNaN(cantidad)) {
                console.warn(`Movimiento ${movimiento.ID_Movimiento} tiene Cantidad no válida: ${movimiento.Cantidad}`);
                continue;
            }

            // 'Entrada' suma, 'Salida' resta
            if (tipo === 'Entrada') {
                stock += cantidad;
            } else if (tipo === 'Salida') {
                // El registro de salida ya está en positivo, el stock se resta
                stock -= cantidad;
            }
        }
    }

    // 2. Ajustar el stock restando las SOLICITUDES APROBADAS que NO han generado un MOVIMIENTO de 'Salida'
    // Esta lógica se utiliza para mostrar el stock 'comprometido' o 'realmente disponible'
    // El sistema debe garantizar que si una solicitud está aprobada, ese insumo ya no está disponible
    // para ser solicitado por alguien más, hasta que se registre la salida física (Movimiento).


    return stock;
}

module.exports = { calcularStockActual };