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

exports.getUserRole = async (userEmail) => {
    // --- LOG 1: Punto de Entrada ---
    console.log(`--- Iniciando auth.js para el email: ${userEmail} ---`);
    
    if (!userEmail) {
        console.log('Error: El email recibido es nulo o indefinido.');
        return null;
    }

    try {
        const auth = getAuthClient();
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'USUARIOS!A:C', 
        });

        // --- LOG 2: Respuesta Cruda de Google Sheets ---
        console.log('Respuesta de Google Sheets API:', JSON.stringify(response.data.values, null, 2));

        const users = response.data.values || [];
        if (users.length > 0) {
            users.shift(); // Quitar encabezados
        }

        const userRow = users.find(row => row && row[0] && row[0].trim().toLowerCase() === userEmail.trim().toLowerCase());

        // --- LOG 3: Fila de Usuario Encontrada ---
        console.log('Fila de usuario encontrada:', userRow);
        
        const role = userRow ? userRow[2].trim().toLowerCase() : null;

        // --- LOG 4: Rol Final Extraído ---
        console.log(`Rol extraído: ${role}`);
        
        return role;

    } catch (error) {
        // --- LOG 5: Error en la Ejecución ---
        console.error('Error Crítico en auth.js al conectar con Google Sheets:', error);
        return null;
    }
};