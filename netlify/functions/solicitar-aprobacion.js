// RUTA: netlify/functions/solicitar-aprobacion.js
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

    try {
        const { orderData, itemsDetails } = JSON.parse(event.body);
        const userEmail = event.auth.email;
        
        // 1. Generar ID único para el borrador
        const draftId = 'DRAFT-' + Date.now();
        
        // 2. Guardar en Sheets (ORDENES_BORRADOR)
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        
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

        // 3. Crear el Link Mágico (Ajusta la URL a la de tu proyecto real)
        // El link lleva el ID del borrador para que el sistema sepa qué cargar
        const approvalLink = `https://gestion-de-insumos.netlify.app#approve=${draftId}`;

        // 4. Enviar Correo al Supervisor (o al admin general por ahora)
        await transporter.sendMail({
            from: `"Sistema de Compras" <${process.env.SMTP_USER}>`,
            to: process.env.ADMIN_EMAIL, // O un email fijo de supervisor
            subject: `Solicitud de Aprobación de Compra - ${userEmail}`,
            html: `
                <h3>Se requiere aprobación para una nueva Orden de Compra</h3>
                <p><strong>Solicitante:</strong> ${userEmail}</p>
                <p><strong>Monto Estimado:</strong> $${orderData.totalOrderCost}</p>
                <p>Por favor revise, edite si es necesario y apruebe la solicitud en el siguiente enlace:</p>
                <p>
                    <a href="${approvalLink}" style="background-color:#28a745; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">
                        Revisar y Aprobar Orden
                    </a>
                </p>
                <p><small>Si el botón no funciona: ${approvalLink}</small></p>
            `
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Solicitud enviada a aprobación.' }) };

    } catch (error) {
        console.error(error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
});