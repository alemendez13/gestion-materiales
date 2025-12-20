// RUTA: netlify/functions/solicitar-aprobacion.js

const nodemailer = require('nodemailer');
const { withAuth } = require('./auth');
// IMPORTAMOS EL CLIENTE CENTRALIZADO (Refactorización Fase 2.1)
const { getSheetsClient } = require('./utils/google-client');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

exports.handler = withAuth(async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

    try {
        const { orderData, itemsDetails } = JSON.parse(event.body);
        const userEmail = event.auth.email;
        
        // 1. Generar ID único para el borrador
        const draftId = 'DRAFT-' + Date.now();
        
        // 2. Guardar en Sheets (ORDENES_BORRADOR)
        const sheets = getSheetsClient();
        
        // Guardamos todo el detalle como un texto JSON en la columna B
        const jsonContent = JSON.stringify({ orderData, itemsDetails });
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'ORDENES_BORRADOR!A1',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[draftId, jsonContent, 'Pendiente', new Date().toISOString(), userEmail]]
            }
        });

        // 3. Crear los Links Mágicos
        // Nota: Asegúrate de que esta URL coincida con la de tu despliegue real
        const baseUrl = 'https://gestion-de-insumos.netlify.app'; 
        
        const approvalLink = `${baseUrl}#approve=${draftId}`;
        const rejectLink = `${baseUrl}#reject=${draftId}`; // <--- NUEVO LINK DE RECHAZO

        // 4. Enviar Correo al Supervisor
        await transporter.sendMail({
            from: `"Sistema de Compras" <${process.env.SMTP_USER}>`,
            to: process.env.ADMIN_EMAIL, 
            subject: `Solicitud de Aprobación de Compra - ${userEmail}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                    <h3 style="color: #2c3e50;">Nueva Orden de Compra requiere revisión</h3>
                    <p><strong>Solicitante:</strong> ${userEmail}</p>
                    <p><strong>Monto Estimado:</strong> $${orderData.totalOrderCost}</p>
                    <p><strong>Proveedor Principal:</strong> ${orderData.providerName}</p>
                    
                    <p style="margin-top: 20px;">Por favor seleccione una acción:</p>
                    
                    <div style="margin: 20px 0;">
                        <a href="${approvalLink}" style="background-color:#28a745; color:white; padding:12px 25px; text-decoration:none; border-radius:5px; font-weight:bold; margin-right: 15px;">
                            Revisar y Aprobar
                        </a>

                        <a href="${rejectLink}" style="background-color:#dc3545; color:white; padding:12px 25px; text-decoration:none; border-radius:5px; font-weight:bold;">
                            Rechazar Solicitud
                        </a>
                    </div>

                    <p style="font-size: 12px; color: #777; margin-top: 30px;">
                        Si los botones no funcionan, copie y pegue estos enlaces:<br>
                        Aprobar: ${approvalLink}<br>
                        Rechazar: ${rejectLink}
                    </p>
                </div>
            `
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Solicitud enviada a aprobación.' }) };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
});