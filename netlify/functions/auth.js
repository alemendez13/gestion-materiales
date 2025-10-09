const { google } = require('googleapis');

const getAuthClient = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
};

// CÓDIGO CORREGIDO
exports.getUserRole = async (userEmail) => {
    if (!userEmail) {
        return null;
    }

    try {
        const auth = getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'USUARIOS!A:C', 
        });

        const users = response.data.values || [];
        if (users.length === 0) return null;

        const headers = users.shift(); // Quitar encabezados

// CÓDIGO CORREGIDO
const userRow = users.find(row => row[0] && row[0].trim().toLowerCase() === userEmail.trim().toLowerCase());

        return userRow ? userRow[2].trim().toLowerCase() : null;

    } catch (error) {
        console.error('Error Crítico en auth.js al conectar con Google Sheets:', error);
        return null;
    }
};
// Nota: El archivo se ha simplificado para exportar directamente la función getUserRole.
// El archivo get-user-profile.js debe ajustarse para llamar a require('./utils/auth') directamente.