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

    // RECIBIMOS DRAFT_ID SI EXISTE
    const { pdfBase64, orderData, itemsDetails, draftId } = JSON.parse(event.body); 
    
    const approverEmail = event.auth.email;

    if (!pdfBase64 || !orderData) return { statusCode: 400, body: 'Faltan datos.' };

    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // 1. Enviar Correo Final
        await transporter.sendMail({
            from: `"Sistema de Compras" <${process.env.SMTP_USER}>`,
            to: [approverEmail, process.env.ADMIN_EMAIL, orderData.providerEmail].filter(Boolean),
            subject: `Orden de Compra AUTORIZADA - ${orderData.providerName}`,
            html: `<p>La orden ha sido aprobada y generada.</p>
                   <p><strong>Autorizado por:</strong> ${approverEmail}</p>
                   <p><strong>Total Final:</strong> $${orderData.totalOrderCost}</p>`,
            attachments: [{ filename: `OC_${Date.now()}.pdf`, content: pdfBase64, encoding: 'base64' }]
        });

        // 2. Actualizar Solicitudes Originales
        if (itemsDetails && itemsDetails.length > 0) {
            for (const item of itemsDetails) {
                if (item.type === 'SOLICITUD' && item.rowIndex) {
                    await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: `SOLICITUDES_COMPRA!H${item.rowIndex}:K${item.rowIndex}`,
                        valueInputOption: 'USER_ENTERED',
                        resource: { 
                            values: [[
                                'En Proceso', 
                                item.providerName || orderData.providerName, 
                                item.unitCost * item.quantity, 
                                orderData.deliveryDate
                            ]] 
                        }
                    });
                }
            }
        }

        // 3. Trazabilidad de Precios
        const provRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'CATALOGO_PROVEEDORES!A:H' });
        const provRows = provRes.data.values || [];
        const updatesByProvider = {}; 

        itemsDetails.forEach(item => {
            if (item.providerId) {
                if (!updatesByProvider[item.providerId]) updatesByProvider[item.providerId] = [];
                updatesByProvider[item.providerId].push(item);
            }
        });

        for (const [provId, items] of Object.entries(updatesByProvider)) {
            const rowIndex = provRows.findIndex(r => r[0] === provId);
            if (rowIndex !== -1) {
                let history = {};
                try { history = JSON.parse(provRows[rowIndex][7] || '{}'); } catch (e) {}
                items.forEach(item => {
                    history[item.name] = {
                        cost: parseFloat(item.unitCost),
                        date: new Date().toISOString().split('T')[0],
                        ref: `OC-${new Date().getTime()}`
                    };
                });
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `CATALOGO_PROVEEDORES!H${rowIndex + 1}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[JSON.stringify(history)]] }
                });
            }
        }

        // --- 4. CERRAR EL BORRADOR (SI EXISTE) ---
        if (draftId) {
            // Buscamos el borrador para marcarlo como 'Procesada'
            const draftRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'ORDENES_BORRADOR!A:C' });
            const draftRows = draftRes.data.values || [];
            const draftRowIndex = draftRows.findIndex(r => r[0] === draftId);
            
            if (draftRowIndex !== -1) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `ORDENES_BORRADOR!C${draftRowIndex + 1}`, // Columna C es Estatus
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [['Procesada']] }
                });
            }
        }

        return { statusCode: 200, body: JSON.stringify({ message: 'Orden procesada correctamente.' }) };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
});