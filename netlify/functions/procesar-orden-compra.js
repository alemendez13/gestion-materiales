// RUTA: netlify/functions/procesar-orden-compra.js

const { google } = require('googleapis');
const nodemailer = require('nodemailer');
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
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

exports.handler = withAuth(async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const { pdfBase64, orderData, selectedRequests } = JSON.parse(event.body);
    const approverEmail = event.auth.email;

    if (!pdfBase64 || !orderData) return { statusCode: 400, body: 'Faltan datos.' };

    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // 1. Enviar Correo (Igual que antes)
        await transporter.sendMail({
            from: `"Sistema de Compras" <${process.env.SMTP_USER}>`,
            to: [approverEmail, process.env.ADMIN_EMAIL, orderData.providerEmail].filter(Boolean), // Copia al proveedor si hay email
            subject: `Orden de Compra Autorizada - ${orderData.providerName}`,
            html: `<p>Adjunto encontrará la orden de compra autorizada.</p>
                   <p><strong>Proveedor:</strong> ${orderData.providerName}</p>
                   <p><strong>Total Estimado:</strong> $${orderData.totalCost}</p>`,
            attachments: [{ filename: `OC_${Date.now()}.pdf`, content: pdfBase64, encoding: 'base64' }]
        });

        // 2. Actualizar Solicitudes (Ahora con Proveedor y Costo)
        if (selectedRequests && selectedRequests.length > 0) {
            for (const req of selectedRequests) {
                if (req.type === 'SOLICITUD' && req.rowIndex) {
                    // Actualizamos columnas H, I, J, K (Estatus, Proveedor, Costo, Fecha)
                    await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: `SOLICITUDES_COMPRA!H${req.rowIndex}:K${req.rowIndex}`,
                        valueInputOption: 'USER_ENTERED',
                        resource: { 
                            values: [[
                                'En Proceso', 
                                orderData.providerName, 
                                orderData.totalCost, // O costo unitario si lo tuvieras desglosado
                                orderData.deliveryDate
                            ]] 
                        }
                    });
                }
            }
        }

        // 3. INTELIGENCIA DE NEGOCIO: Actualizar el Historial de Precios del Proveedor
        // Si seleccionamos un proveedor del catálogo, actualizamos sus precios.
        if (orderData.providerId) {
            // a. Buscar la fila del proveedor
            const provRes = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'CATALOGO_PROVEEDORES!A:H'
            });
            const rows = provRes.data.values || [];
            const rowIndex = rows.findIndex(r => r[0] === orderData.providerId);

            if (rowIndex !== -1) {
                // b. Leer historial actual
                let history = {};
                try { history = JSON.parse(rows[rowIndex][7] || '{}'); } catch (e) {}

                // c. Agregar nuevos items (Solo guardamos el último precio)
                // Asumimos que 'selectedRequests' tiene nombres de productos
                selectedRequests.forEach(req => {
                    history[req.name] = {
                        cost: orderData.totalCost, // Nota: Esto es un aprox si la orden tiene varios items.
                        date: new Date().toISOString().split('T')[0]
                    };
                });

                // d. Guardar JSON actualizado en Columna H
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `CATALOGO_PROVEEDORES!H${rowIndex + 1}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[JSON.stringify(history)]] }
                });
            }
        }

        return { statusCode: 200, body: JSON.stringify({ message: 'Orden procesada.' }) };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
});