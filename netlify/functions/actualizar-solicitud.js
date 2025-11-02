// RUTA: netlify/functions/actualizar-solicitud.js

const { google } = require('googleapis');
const nodemailer = require('nodemailer');
// NUEVO: Importar 'withAuth'
const { withAuth } = require('./auth');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// MODIFICADO: Envolver con 'withAuth'
exports.handler = withAuth(async (event) => {

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // --- BLOQUE DE SEGURIDAD ANTIGUO ELIMINADO ---

    try {
        const { requestId, action } = JSON.parse(event.body);
        
        // --- INICIO LÓGICA DE AUTENTICACIÓN MEJORADA ---
        const approverEmail = event.auth.email; // Email confiable del token
        const userRole = event.auth.role;

        if (userRole !== 'admin' && userRole !== 'supervisor') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. No tienes permisos para esta acción.' }) };
        }
        // --- FIN LÓGICA DE AUTENTICACIÓN ---

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const timestamp = new Date().toISOString();

        // --- INICIO DE LA LÓGICA DE DESPACHO UNIFICADA (Corrigiendo L-1, L-2, L-3) ---

        // Paso 1: Leer la solicitud original
        const requestResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'SOLICITUDES!A:E',
        });

        const allRequests = requestResponse.data.values;
        const rowIndex = allRequests.findIndex(row => row[0] === requestId);

        if (rowIndex === -1) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Solicitud no encontrada.' }) };
        }

        const requestData = allRequests[rowIndex];
        const itemId = requestData[3];
        let quantityToDispense = parseInt(requestData[4]);
        const originalQuantity = quantityToDispense; // Guardamos la cantidad original para el correo
        const requesterEmail = requestData[2];
        const requestRowIndex = rowIndex + 1; // +1 para índice 1-based

        // Paso 2: Leer AMBAS fuentes de inventario físico
        const [lotsResponse, nonPerishableResponse] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'LOTES!A:F' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'STOCK_NO_PERECEDERO!A:B' })
        ]);

        // 2a. Procesar Lotes (Perecederos)
        let allLots = (lotsResponse.data.values || []).slice(1);
        let availableLots = allLots
            .map((row, index) => ({ data: row, originalIndex: index + 2 })) // +2 por slice y 1-based
            .filter(lot => lot.data[1] === itemId && parseInt(lot.data[3]) > 0);
        
        availableLots.sort((a, b) => new Date(a.data[4]) - new Date(b.data[4])); // Ordenar FEFO

        // 2b. Procesar No Perecederos
        let allNonPerishable = (nonPerishableResponse.data.values || []);
        let nonPerishableStock = { quantity: 0, rowIndex: -1 };
        const nonPerishableRowIndex = allNonPerishable.findIndex(row => row[0] === itemId);

        if (nonPerishableRowIndex > -1) {
            nonPerishableStock.quantity = parseInt(allNonPerishable[nonPerishableRowIndex][1]) || 0;
            nonPerishableStock.rowIndex = nonPerishableRowIndex + 1; // +1 para índice 1-based
        }

        // Paso 3: Validar Stock Total (Corrección Falla L-3)
        const lotStock = availableLots.reduce((acc, lot) => acc + parseInt(lot.data[3] || 0), 0);
        const totalStockAvailable = lotStock + nonPerishableStock.quantity;

        if (action === 'Aprobada') {
            if (totalStockAvailable < quantityToDispense) {
                return { 
                    statusCode: 400,
                    body: JSON.stringify({ error: `Stock insuficiente. Solicitados: ${quantityToDispense}, Disponibles: ${totalStockAvailable}` }) 
                };
            }

            // Paso 4: Despachar inventario (Transacción Segura - Corrección L-1 y L-2)
            
            // 4a. Despachar de LOTES (FEFO) primero
            for (const lot of availableLots) {
                if (quantityToDispense <= 0) break;

                let lotAvailableQty = parseInt(lot.data[3]);
                const dispenseFromThisLot = Math.min(quantityToDispense, lotAvailableQty);

                lotAvailableQty -= dispenseFromThisLot;
                quantityToDispense -= dispenseFromThisLot;

                // Actualizar la hoja LOTES
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `LOTES!D${lot.originalIndex}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[lotAvailableQty]] },
                });
            }

            // 4b. Si aún falta, despachar de STOCK_NO_PERECEDERO
            if (quantityToDispense > 0) {
                if (nonPerishableStock.rowIndex === -1 || nonPerishableStock.quantity < quantityToDispense) {
                    // Esto no debería pasar gracias a la validación del Paso 3, pero es una defensa
                    throw new Error('Error de lógica de despacho no perecedero.');
                }

                const newNonPerishableQty = nonPerishableStock.quantity - quantityToDispense;
                
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `STOCK_NO_PERECEDERO!B${nonPerishableStock.rowIndex}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[newNonPerishableQty]] },
                });

                quantityToDispense = 0; // Solicitud completada
            }

            // Paso 5: Escribir en el libro mayor (MOVIMIENTOS) DESPUÉS de actualizar el stock
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'MOVIMIENTOS!A1',
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [
                        // Usamos la 'originalQuantity' para el movimiento
                        ['MOV-' + new Date().getTime(), timestamp, itemId, 'Salida', originalQuantity, '', '', '', '', '', '', approverEmail]
                    ],
                },
            });

            // Paso 6: Enviar correo de confirmación
            await transporter.sendMail({
                from: `"Sistema de Inventarios" <${process.env.SMTP_USER}>`,
                to: requesterEmail,
                subject: `Tu solicitud ${requestId} ha sido aprobada`,
                html: `<p>Hola,</p><p>Tu solicitud de <strong>${originalQuantity} x ${itemId}</strong> ha sido aprobada y está lista para ser entregada.</p><p>Saludos,<br>El equipo de Administración.</p>`,
            });
        }

        // Paso 7: Actualizar la solicitud (común para Aprobar o Rechazar)
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `SOLICITUDES!F${requestRowIndex}:H${requestRowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[action, approverEmail, timestamp]] },
        });
        
        return { statusCode: 200, body: JSON.stringify({ message: `Solicitud ${action.toLowerCase()} con éxito.` }) };

    } catch (error) {
        console.error('Error al actualizar:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
});