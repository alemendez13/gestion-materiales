// RUTA: netlify/functions/verificar-stock.js

const { google } = require('googleapis');
const nodemailer = require('nodemailer');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
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

exports.handler = async (event) => {
    
    // Esta función debe ser protegida para que solo un cron job o admin pueda llamarla.
    const apiKey = event.headers['x-api-key'];
    if (apiKey !== process.env.APP_API_KEY) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Acceso denegado.' }) };
    }

    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });

        const [catalogRes, movementsRes] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'CATALOGO_INSUMOS!A:M' }),
            sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'MOVIMIENTOS!A:L' })
        ]);

        const catalogRows = (catalogRes.data.values || []).slice(1);
        const movementRows = (movementsRes.data.values || []).slice(1);

        if (catalogRows.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ message: 'No hay items en el catálogo para verificar.' }) };
        }

        const stockMap = {};
        movementRows.forEach(mov => {
            const itemId = mov[2];
            const type = mov[3];
            const quantity = Number(mov[4]);
            if (!stockMap[itemId]) stockMap[itemId] = 0;
            stockMap[itemId] += (type === 'Entrada' ? quantity : -quantity);
        });

        const lowStockItems = [];
        catalogRows.forEach(item => {
            const id = item[1];
            const name = item[3];
            const minStock = Number(item[7]) || 0;
            const currentStock = stockMap[id] || 0;
            
            if (currentStock <= minStock) {
                lowStockItems.push({ name, stock: currentStock, minStock });
            }
        });

        if (lowStockItems.length > 0) {
            let emailBody = '<p>Los siguientes productos han alcanzado o caído por debajo de su nivel de stock mínimo:</p><ul>';
            lowStockItems.forEach(item => {
                emailBody += `<li><strong>${item.name}</strong>: ${item.stock} en stock (Mínimo: ${item.minStock})</li>`;
            });
            emailBody += '</ul><p>Por favor, planifique la reposición.</p>';

            await transporter.sendMail({
                from: `"Sistema de Inventarios" <${process.env.SMTP_USER}>`,
                to: process.env.ADMIN_EMAIL,
                subject: 'Alerta de Stock Mínimo',
                html: emailBody,
            });
            return { statusCode: 200, body: JSON.stringify({ message: `Alerta de stock bajo enviada para ${lowStockItems.length} items.` }) };
        }

        return { statusCode: 200, body: JSON.stringify({ message: 'Todos los productos están por encima del stock mínimo.' }) };

    } catch (error) {
        console.error("Error al verificar stock:", error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Error al verificar el stock.' }) };
    }
};