// RUTA: netlify/functions/limpiar-tokens.js
const { google } = require('googleapis');
// Importamos el planificador de Netlify
const { schedule } = require('@netlify/functions');

const getAuth = () => new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Lógica principal de limpieza
const cleanTokensHandler = async (event) => {
    try {
        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const range = 'LOGIN_TOKENS!A:C';

        // 1. LEER
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        const rows = response.data.values || [];
        
        if (rows.length <= 1) {
            console.log('Limpieza: No hay tokens para limpiar.');
            return { statusCode: 200 };
        }

        const header = rows[0];
        const dataRows = rows.slice(1);
        const now = new Date();

        // 2. FILTRAR (Garbage Collector)
        const validRows = dataRows.filter(row => {
            const expiresAt = new Date(row[2]);
            return expiresAt > now;
        });

        const deletedCount = dataRows.length - validRows.length;

        if (deletedCount === 0) {
            console.log('Limpieza: Todos los tokens son válidos.');
            return { statusCode: 200 };
        }

        // 3. SOBRESCRIBIR
        await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'LOGIN_TOKENS!A:C' });
        
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: 'LOGIN_TOKENS!A1',
            valueInputOption: 'USER_ENTERED',
            resource: { values: [header, ...validRows] },
        });

        console.log(`Limpieza completada: Se eliminaron ${deletedCount} tokens expirados.`);
        return { statusCode: 200 };

    } catch (error) {
        console.error('Error en cron de limpieza:', error);
        return { statusCode: 500 };
    }
};

// Configuración del CRON: '0 0 * * *' significa "Todos los días a las 00:00 (Medianoche)"
exports.handler = schedule('0 0 * * *', cleanTokensHandler);