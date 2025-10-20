// RUTA: netlify/functions/actualizar solicitudes.js (MODIFICADO para Plan 2)

const { google } = require('googleapis');
// Importar auth.js (asumiendo que está en una ruta relativa)
const { getUserRole } = require('./auth'); 
const nodemailer = require('nodemailer'); // Se importa nodemailer


// Esta función auxiliar para la autenticación se mantiene igual
const getAuth = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
};

// --- INICIO DE LA NUEVA FUNCIONALIDAD DE EMAIL ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true, // true para puerto 465, false para otros
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});
// --- FIN DE LA NUEVA FUNCIONALIDAD DE EMAIL ---

exports.handler = async (event, context) => {

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // --- INICIO DEL BLOQUE DE SEGURIDAD (API KEY + GSHEETS ROLE) ---
    
    // 1. Validar la Clave de API enviada en el Header 'x-api-key'
    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. Clave de API inválida.' }) };
    }

    try {
        // Obtenemos los datos del cuerpo: requestId, action, y ahora el email del administrador
        const { requestId, action, approverEmail } = JSON.parse(event.body); 
        
        // El email del usuario debe ser enviado por el frontend.
        if (!approverEmail) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Email del administrador faltante en la solicitud.' }) };
        }

        // 2. Validar el Rol del Usuario en Google Sheets
        const userRole = await getUserRole(approverEmail);
        
if (userRole !== 'admin' && userRole !== 'supervisor') {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado. No tienes permisos de administrador.' }) };
        }
        
        // --- FIN DEL NUEVO BLOQUE DE SEGURIDAD ---

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const timestamp = new Date().toISOString();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'SOLICITUDES!A:E',
        });

        const rows = response.data.values;
        const rowIndex = rows.findIndex(row => row[0] === requestId);

        if (rowIndex === -1) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Solicitud no encontrada.' }) };
        }

        const requestData = rows[rowIndex];
        const itemId = requestData[3];
        let quantityToDispense = parseInt(requestData[4]);
        const requesterEmail = requestData[2];

        if (action === 'Aprobada') {
// --- INICIO DE LA LÓGICA FEFO ---
            
            // 1. Leer todos los lotes disponibles para el insumo solicitado.
            const lotsResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'LOTES!A:F' });
            let allLots = (lotsResponse.data.values || []).slice(1);

            let availableLots = allLots
                .map((row, index) => ({ data: row, originalIndex: index + 2 })) // Guardamos el índice original
                .filter(lot => lot.data[1] === itemId && parseInt(lot.data[3]) > 0);

            if (availableLots.length > 0) {
                // 2. Ordenar los lotes por fecha de caducidad (el más próximo primero).
                availableLots.sort((a, b) => new Date(a.data[4]) - new Date(b.data[4]));
                
                // 3. Descontar la cantidad de los lotes, empezando por el más próximo a caducar.
                for (const lot of availableLots) {
                    if (quantityToDispense <= 0) break;

                    const lotId = lot.data[0];
                    let lotAvailableQty = parseInt(lot.data[3]);
                    const dispenseFromThisLot = Math.min(quantityToDispense, lotAvailableQty);

                    lotAvailableQty -= dispenseFromThisLot;
                    quantityToDispense -= dispenseFromThisLot;

                    // Actualizar la cantidad disponible en la hoja LOTES
                    await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: `LOTES!D${lot.originalIndex}`,
                        valueInputOption: 'USER_ENTERED',
                        resource: { values: [[lotAvailableQty]] },
                    });
                }
            }
            // --- FIN DE LA LÓGICA FEFO ---

                    await sheets.spreadsheets.values.append({
                                    spreadsheetId,
                                    range: 'MOVIMIENTOS!A1',
                                    valueInputOption: 'USER_ENTERED',
                                    resource: {
                    values: [
                        ['MOV-' + new Date().getTime(), new Date().toISOString(), itemId, 'Salida', Math.abs(quantityToDispense), '', '', '', '', '', '', approverEmail]
                    ],
                },
            });

// --- ENVÍO DE CORREO DE CONFIRMACIÓN ---
            const originalQuantity = requestData[4]; // Obtenemos la cantidad original solicitada
            const itemName = requestData[3]; // Obtenemos el ID/Nombre del insumo
            
            await transporter.sendMail({
                from: `"Sistema de Inventarios" <${process.env.SMTP_USER}>`,
                to: requesterEmail,
                subject: `Tu solicitud ${requestId} ha sido aprobada`,
                // Usamos la variable "originalQuantity" para mostrar la cantidad correcta.
                html: `<p>Hola,</p><p>Tu solicitud de <strong>${originalQuantity} x ${itemName}</strong> ha sido aprobada y está lista para ser entregada.</p><p>Saludos,<br>El equipo de Administración.</p>`,
            });
            // --- FIN DEL ENVÍO DE CORREO ---

        }

        const rowNumber = rowIndex + 1;

        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `SOLICITUDES!F${rowIndex + 1}:H${rowIndex + 1}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[action, approverEmail, timestamp]] },
        });
        
return { statusCode: 200, body: JSON.stringify({ message: 'Solicitud actualizada y lote despachado con éxito.' }) };

    } catch (error) {
        console.error('Error al actualizar:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error interno del servidor.' }) };
    }
};