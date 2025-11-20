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
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

exports.handler = withAuth(async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    const userRole = event.auth.role;
    const approverEmail = event.auth.email;

    if (userRole !== 'admin' && userRole !== 'supervisor') {
        return { statusCode: 403, body: JSON.stringify({ error: 'No autorizado.' }) };
    }

    try {
        const { 
            pdfBase64, // El PDF generado en el frontend
            orderData, // Datos generales de la orden (proveedor, fecha)
            selectedRequests // Array de IDs de solicitudes de compra aprobadas (tipo SOLICITUD)
        } = JSON.parse(event.body);

        if (!pdfBase64 || !orderData) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos de la orden.' }) };
        }

        // 1. Enviar Correo al Autorizador (con PDF)
        const mailOptions = {
            from: `"Sistema de Inventarios" <${process.env.SMTP_USER}>`,
            to: approverEmail, // Se envía a quien autorizó
            cc: process.env.ADMIN_EMAIL, // Copia al admin general/compras
            subject: `Orden de Compra Autorizada - ${orderData.provider || 'General'}`,
            html: `
                <h3>Orden de Compra Generada</h3>
                <p><strong>Autorizado por:</strong> ${approverEmail}</p>
                <p><strong>Proveedor:</strong> ${orderData.provider}</p>
                <p><strong>Fecha de Entrega Estimada:</strong> ${orderData.deliveryDate}</p>
                <p>Se adjunta el documento PDF oficial.</p>
            `,
            attachments: [
                {
                    filename: `Orden_Compra_${new Date().getTime()}.pdf`,
                    content: pdfBase64,
                    encoding: 'base64'
                }
            ]
        };

        await transporter.sendMail(mailOptions);

        // 2. Actualizar Estatus en Google Sheets (Solo para las SOLICITUDES de usuarios)
        if (selectedRequests && selectedRequests.length > 0) {
            const auth = getAuth();
            const sheets = google.sheets({ version: 'v4', auth });
            const spreadsheetId = process.env.GOOGLE_SHEET_ID;
            const timestamp = new Date().toISOString();

            // Esto es ineficiente si son muchas, pero funcional para volumen bajo.
            // Idealmente usaríamos batchUpdate.
            // Aquí asumimos que 'selectedRequests' trae { rowIndex, id, requesterEmail }
            
            // Recorremos las solicitudes aprobadas
            for (const req of selectedRequests) {
                if (req.type === 'SOLICITUD' && req.rowIndex) {
                    // Actualizar columna H (Estatus) a 'En Proceso' o 'Comprado'
                    await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: `SOLICITUDES_COMPRA!H${req.rowIndex}`,
                        valueInputOption: 'USER_ENTERED',
                        resource: { values: [['En Proceso']] }
                    });

                    // Enviar notificación al solicitante original
                    try {
                        await transporter.sendMail({
                            from: `"Sistema de Inventarios" <${process.env.SMTP_USER}>`,
                            to: req.requester,
                            subject: `Tu solicitud de compra ha sido aprobada`,
                            html: `<p>Hola,</p>
                                   <p>Tu solicitud para comprar <strong>${req.name}</strong> ha sido autorizada e incluida en una orden de compra.</p>
                                   <p>Estatus: <strong>En Proceso</strong></p>`
                        });
                    } catch (emailErr) {
                        console.warn(`No se pudo enviar correo a ${req.requester}`);
                    }
                }
            }
        }

        return { statusCode: 200, body: JSON.stringify({ message: 'Orden procesada y correos enviados.' }) };

    } catch (error) {
        console.error("Error procesando orden:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
});