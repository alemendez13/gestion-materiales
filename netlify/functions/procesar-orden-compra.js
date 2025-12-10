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

    // --- INICIO MODIFICACIÓN: RECIBIR DETALLES DE ITEMS ---
    const { pdfBase64, orderData, itemsDetails } = JSON.parse(event.body); 
    // itemsDetails es el array con { name, quantity, unitCost, providerId, ... }
    // --- FIN MODIFICACIÓN ---
    
    const approverEmail = event.auth.email;

    if (!pdfBase64 || !orderData) return { statusCode: 400, body: 'Faltan datos.' };

    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // 1. Enviar Correo (Se mantiene, usa el total global para el asunto)
        await transporter.sendMail({
            from: `"Sistema de Compras" <${process.env.SMTP_USER}>`,
            to: [approverEmail, process.env.ADMIN_EMAIL, orderData.providerEmail].filter(Boolean),
            subject: `Orden de Compra Autorizada - ${orderData.providerName || 'Varios'}`,
            html: `<p>Adjunto encontrará la orden de compra autorizada.</p>
                   <p><strong>Total Orden:</strong> $${orderData.totalOrderCost}</p>`,
            attachments: [{ filename: `OC_${Date.now()}.pdf`, content: pdfBase64, encoding: 'base64' }]
        });

        // 2. Actualizar Solicitudes (Si aplica)
        // (Aquí podrías refinar si cada solicitud tuvo un proveedor distinto, 
        // pero por simplicidad de esta fase, marcamos "En Proceso")
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

        // --- INICIO MODIFICACIÓN: TRAZABILIDAD POR PRODUCTO ---
        // 3. Actualizar Historial de Precios POR PROVEEDOR y POR PRODUCTO
        
        // Primero, leemos todos los proveedores para no hacer N llamadas
        const provRes = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'CATALOGO_PROVEEDORES!A:H'
        });
        const provRows = provRes.data.values || [];

        // Agrupamos items por proveedor para optimizar escrituras
        const updatesByProvider = {}; 

        itemsDetails.forEach(item => {
            if (item.providerId) {
                if (!updatesByProvider[item.providerId]) {
                    updatesByProvider[item.providerId] = [];
                }
                updatesByProvider[item.providerId].push(item);
            }
        });

        // Procesamos cada proveedor involucrado
        for (const [provId, items] of Object.entries(updatesByProvider)) {
            const rowIndex = provRows.findIndex(r => r[0] === provId);
            
            if (rowIndex !== -1) {
                // Leer historial actual del proveedor
                let history = {};
                try { history = JSON.parse(provRows[rowIndex][7] || '{}'); } catch (e) {}

                // Actualizar historial con los nuevos precios
                items.forEach(item => {
                    history[item.name] = {
                        cost: parseFloat(item.unitCost), // Costo Unitario real
                        date: new Date().toISOString().split('T')[0],
                        ref: `OC-${new Date().getTime()}`
                    };
                });

                // Guardar
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `CATALOGO_PROVEEDORES!H${rowIndex + 1}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [[JSON.stringify(history)]] }
                });
            }
        }
        // --- FIN MODIFICACIÓN ---

        return { statusCode: 200, body: JSON.stringify({ message: 'Orden procesada.' }) };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
});