// RUTA: netlify/functions/verify-session.js

const { google } = require('googleapis');
const { getUserRole } = require('./auth');
// NUEVO: Importar uuid para crear el nuevo token de sesión
const { v4: uuidv4 } = require('uuid'); 

const getAuth = () => {
    return new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
};

exports.handler = async (event) => {
    
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { token } = JSON.parse(event.body); // Token de Magic Link

        if (!token) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Token requerido.' }) };
        }

        const auth = getAuth();
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const range = 'LOGIN_TOKENS!A:C';

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        const rows = response.data.values || [];
        const now = new Date();

        let foundTokenIndex = -1;
        let validTokenData = null;

        for (let i = 0; i < rows.length; i++) {
            const rowToken = rows[i][0]; 
            const rowEmail = rows[i][1]; 
            const rowExpires = new Date(rows[i][2]);

            if (rowToken === token) {
                foundTokenIndex = i;
                if (now < rowExpires) {
                    validTokenData = { email: rowEmail, rowIndex: i + 1 };
                }
                break;
            }
        }

        if (validTokenData) {
            
            // 1. Borrar el token de Magic Link (OTU)
            sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId: (await getSheetId(sheets, spreadsheetId, 'LOGIN_TOKENS')),
                                dimension: 'ROWS',
                                startIndex: validTokenData.rowIndex - 1,
                                endIndex: validTokenData.rowIndex
                            }
                        }
                    }]
                }
            }).catch(err => console.error("Error al borrar el token:", err));

            // 2. Obtener el rol
            const role = await getUserRole(validTokenData.email);
            if (!role) {
                 return { statusCode: 403, body: JSON.stringify({ error: 'Usuario válido pero sin rol asignado.' }) };
            }

            // --- INICIO DE LA MODIFICACIÓN ---
            // 3. Crear un NUEVO token de sesión
            const newSessionToken = uuidv4();
            const sessionExpirationTime = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 horas

            // 4. Guardar el NUEVO token de sesión
            await sheets.spreadsheets.values.append({
                spreadsheetId: process.env.GOOGLE_SHEET_ID,
                range: 'LOGIN_TOKENS!A1', // Escribir en la misma hoja
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [
                        [newSessionToken, validTokenData.email, sessionExpirationTime.toISOString()]
                    ],
                },
            });

            // 5. Devolver el NUEVO token al frontend
            return {
                statusCode: 200,
                body: JSON.stringify({
                    email: validTokenData.email,
                    role: role,
                    token: newSessionToken // Devolver el nuevo token
                })
            };
            // --- FIN DE LA MODIFICACIÓN ---

        } else {
            return { 
                statusCode: 403, 
                body: JSON.stringify({ error: 'Token inválido o expirado.' }) 
            };
        }

    } catch (error) {
        console.error('Error en verify-session:', error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'Error interno del servidor.' }) 
        };
    }
};

// ... (la función getSheetId se queda igual) ...
async function getSheetId(sheets, spreadsheetId, sheetName) {
    const response = await sheets.spreadsheets.get({
        spreadsheetId,
    });
    const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
    if (sheet) {
        return sheet.properties.sheetId;
    }
    throw new Error(`No se pudo encontrar el Sheet ID para la hoja: ${sheetName}`);
}