
const nodemailer = require('nodemailer');
const { withAuth } = require('./auth');
// IMPORTAMOS EL CLIENTE CENTRALIZADO
const { getSheetsClient } = require('./utils/google-client');


const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

exports.handler = withAuth(async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    try {
        const { draftId } = JSON.parse(event.body);
        const sheets = getSheetsClient();
        
        // 1. Buscar Borrador para obtener email del solicitante
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'ORDENES_BORRADOR!A:E'
        });
        const rows = res.data.values || [];
        const rowIndex = rows.findIndex(r => r[0] === draftId);
        
        if (rowIndex === -1) return { statusCode: 404, body: 'Borrador no encontrado' };
        
        const requesterEmail = rows[rowIndex][4]; // Columna E: Solicitante

        // 2. Actualizar Estatus a 'Rechazada'
        await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: `ORDENES_BORRADOR!C${rowIndex + 1}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [['Rechazada']] }
        });

        // 3. Notificar
        await transporter.sendMail({
            from: `"Sistema de Compras" <${process.env.SMTP_USER}>`,
            to: requesterEmail,
            subject: 'Solicitud de Compra Rechazada',
            html: `<p>Su solicitud de compra (${draftId}) ha sido rechazada por la administración.</p>`
        });

        return { statusCode: 200, body: JSON.stringify({ message: 'Rechazado' }) };
    } catch (e) { return { statusCode: 500, body: JSON.stringify({ error: e.message }) }; }
});